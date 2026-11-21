"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addManualMessageAction } from "@/app/actions/clients";
import { CreatePRButton } from "./CreatePRButton";
import { ErrorBanner } from "./ErrorBanner";
import { badgeBase, channelLabel, formatDateTime, senderLabel, type MessageView } from "./shared";

function senderClass(sender: string): string {
  if (sender === "client") return "bg-ground text-ink border border-hairline";
  if (sender === "freelancer") return "bg-add-tint text-add";
  return "border border-dashed border-hairline text-muted";
}

function ManualMessageForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [sender, setSender] = useState("client");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const res = await addManualMessageAction(clientId, formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setText("");
      router.refresh();
    } catch {
      setError("Không thể thêm tin nhắn. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-[10px] border border-hairline bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">Thêm tin nhắn thủ công</h3>
      <Textarea
        name="text"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Dán nội dung tin nhắn của khách hoặc của bạn..."
        aria-label="Nội dung tin nhắn"
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm text-muted">
          Người gửi
          <select
            name="sender"
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            className="h-11 rounded-[10px] border border-hairline bg-surface px-3 text-sm text-ink"
          >
            <option value="client">Khách hàng</option>
            <option value="freelancer">Freelancer</option>
            <option value="unknown">Chưa rõ</option>
          </select>
        </label>
        <Button type="submit" disabled={loading || !text.trim()}>
          {loading ? "Đang thêm..." : "Thêm tin nhắn"}
        </Button>
      </div>
      <ErrorBanner message={error} />
    </form>
  );
}

export function InboxTab({
  clientId,
  pendingCount,
  messages,
}: {
  clientId: string;
  pendingCount: number;
  messages: MessageView[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-[10px] border border-hairline bg-surface p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-medium text-ink tabular">{pendingCount} tin nhắn chờ</p>
          <p className="text-sm text-muted">AI sẽ gom các tin chờ thành một PR thay đổi yêu cầu để bạn duyệt.</p>
        </div>
        <CreatePRButton clientId={clientId} disabled={pendingCount === 0} />
      </div>

      {messages.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-hairline bg-surface px-6 py-10 text-center text-sm text-muted">
          Chưa có tin nhắn nào. Thêm tin nhắn thủ công bên dưới hoặc gửi qua Zalo bot.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {messages.map((m) => {
            const pending = m.prId === null;
            return (
              <li
                key={m.id}
                className={
                  pending
                    ? "rounded-[10px] border border-modify/40 border-l-4 border-l-modify bg-modify-tint/50 p-3"
                    : "rounded-[10px] border border-hairline bg-surface p-3"
                }
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className={`${badgeBase} bg-ground text-ink`}>{channelLabel(m.channel)}</span>
                  <span className={`${badgeBase} ${senderClass(m.sender)}`}>{senderLabel(m.sender)}</span>
                  {pending ? <span className={`${badgeBase} bg-modify text-white`}>Chờ tổng hợp</span> : null}
                  <span className="ml-auto text-xs text-muted tabular">{formatDateTime(m.sentAt)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-ink">{m.text}</p>
              </li>
            );
          })}
        </ul>
      )}

      <ManualMessageForm clientId={clientId} />
    </div>
  );
}
