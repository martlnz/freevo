"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Info, Loader2, Sparkles, UploadCloud, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { assignContactMessagesAction, assignMessageAction } from "@/app/actions/clients";
import { formatVND } from "@/lib/pricing-calc";
import { ErrorBanner } from "@/components/clients/ErrorBanner";
import { badgeBase, channelLabel, formatDateTime, senderLabel } from "@/components/clients/shared";

export type UnassignedMessageView = {
  id: string;
  channel: string;
  sender: string;
  text: string;
  contact: string | null;
  sourceImage: string | null;
  suggestedClientId: string | null;
  suggestedClientName: string | null;
  suggestedReason: string | null;
  sentAt: string;
};

export type InboxClientOption = {
  id: string;
  name: string;
  projectName: string | null;
};

type ScreenshotData = {
  clientId: string | null;
  clientName: string | null;
  extractedCount: number;
  suggestedClientName: string | null;
  suggestedReason: string | null;
  detectedBudget: number | null;
};

type ScreenshotResponse = { ok: true; data: ScreenshotData } | { ok: false; error: string };

type UploadNotice =
  | { kind: "matched"; clientId: string; clientName: string; count: number; budget: number | null }
  | { kind: "unassigned"; count: number; suggestion: string | null; reason: string | null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function newClientHref(contact: string): string {
  return `/clients/new?${EMAIL_RE.test(contact.trim()) ? "email=" + encodeURIComponent(contact.trim()) : "contact=" + encodeURIComponent(contact.trim())}`;
}

export function InboxUnassignedClient({
  messages,
  clients,
}: {
  messages: UnassignedMessageView[];
  clients: InboxClientOption[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<UploadNotice | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setUploadError("Tệp không phải là ảnh. Vui lòng chọn ảnh chụp màn hình (PNG, JPG, WebP).");
        return;
      }
      setUploading(true);
      setUploadError(null);
      setNotice(null);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/screenshots", { method: "POST", body: form });
        const json = (await res.json()) as ScreenshotResponse;
        if (!res.ok || !json.ok) {
          setUploadError(!json.ok ? json.error : "Không thể xử lý ảnh chụp màn hình.");
          return;
        }
        const d = json.data;
        if (d.clientId) {
          setNotice({
            kind: "matched",
            clientId: d.clientId,
            clientName: d.clientName ?? "khách hàng",
            count: d.extractedCount,
            budget: d.detectedBudget ?? null,
          });
        } else {
          setNotice({
            kind: "unassigned",
            count: d.extractedCount,
            suggestion: d.suggestedClientName,
            reason: d.suggestedReason,
          });
        }
        router.refresh();
      } catch {
        setUploadError("Không thể kết nối máy chủ để đọc ảnh. Vui lòng thử lại.");
      } finally {
        setUploading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void uploadFile(file);
            return;
          }
        }
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [uploadFile]);

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
    e.target.value = "";
  }

  async function assignOne(messageId: string, clientId: string) {
    setBusyKey("msg:" + messageId);
    setActionError(null);
    setActionInfo(null);
    try {
      const res = await assignMessageAction(messageId, clientId);
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      if (res.data.learnedEmail) {
        setActionInfo(
          `Đã lưu ${res.data.learnedEmail} vào khách hàng và gom ${res.data.totalAssignedCount} tin — email sau từ địa chỉ này sẽ tự động vào đúng khách.`,
        );
      } else if (res.data.totalAssignedCount > 1) {
        setActionInfo(`Đã gom ${res.data.totalAssignedCount} tin cùng liên hệ vào khách hàng.`);
      }
      router.refresh();
    } catch {
      setActionError("Không thể gán tin nhắn. Vui lòng thử lại.");
    } finally {
      setBusyKey(null);
    }
  }

  async function assignContact(contact: string, clientId: string) {
    setBusyKey("contact:" + contact);
    setActionError(null);
    setActionInfo(null);
    try {
      const res = await assignContactMessagesAction(contact, clientId);
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      if (res.data.learnedEmail) {
        setActionInfo(
          `Đã lưu ${res.data.learnedEmail} vào khách hàng và gom ${res.data.count} tin — email sau từ địa chỉ này sẽ tự động vào đúng khách.`,
        );
      } else {
        setActionInfo(`Đã gán ${res.data.count} tin từ ${contact} cho khách hàng.`);
      }
      router.refresh();
    } catch {
      setActionError("Không thể gán hàng loạt tin nhắn. Vui lòng thử lại.");
    } finally {
      setBusyKey(null);
    }
  }

  const contactCounts = new Map<string, number>();
  for (const m of messages) {
    if (m.contact) contactCounts.set(m.contact, (contactCounts.get(m.contact) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Hộp tin chưa phân loại</h1>
        <p className="mt-1 text-sm text-muted">
          Dán hoặc kéo thả ảnh chụp hội thoại Zalo, Gmail để AI tự nhận diện khách và tách tin nhắn. Tin chưa rõ khách sẽ nằm ở danh sách bên dưới.
        </p>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed px-4 py-8 text-center transition-colors ${
          dragging ? "border-accent bg-add-tint" : "border-hairline bg-surface hover:bg-ground"
        }`}
      >
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
        {uploading ? (
          <>
            <Loader2 className="size-6 animate-spin text-accent" />
            <p className="text-sm font-medium text-ink">AI đang đọc ảnh chụp và nhận diện khách hàng...</p>
          </>
        ) : (
          <>
            <UploadCloud className="size-6 text-accent" />
            <p className="text-sm font-medium text-ink">Kéo thả ảnh vào đây, bấm để chọn tệp hoặc dán ảnh bằng Ctrl+V</p>
            <p className="text-xs text-muted">AI đọc tên người đối thoại trên đầu ảnh và tự định tuyến vào đúng khách.</p>
          </>
        )}
      </div>

      <ErrorBanner message={uploadError} />

      {notice?.kind === "matched" ? (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-[10px] border border-add/30 bg-add-tint px-4 py-3 text-sm text-add sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex items-start gap-2 font-medium">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <span>
              {`Đã nhận diện: ${notice.clientName} · đã lưu nội dung ảnh vào hộp tin`}
              {notice.budget !== null && notice.budget > 0 ? ` · ngân sách ${formatVND(notice.budget)}` : ""}
            </span>
          </span>
          <Link
            href={"/clients/" + notice.clientId}
            className="inline-flex h-9 items-center justify-center rounded-[10px] border border-add/30 bg-surface px-3 font-medium text-ink hover:bg-ground"
          >
            Mở trang khách
          </Link>
        </div>
      ) : null}

      {notice?.kind === "unassigned" ? (
        <div role="status" className="flex items-start gap-2 rounded-[10px] border border-modify/30 bg-modify-tint px-4 py-3 text-sm text-modify">
          <Info className="mt-0.5 size-4 shrink-0" />
          <div className="flex flex-col gap-1">
            <span className="font-medium">
              Đã đọc ảnh và lưu vào danh sách chưa phân loại bên dưới
            </span>
            {notice.suggestion ? (
              <span>
                {`AI gợi ý: ${notice.suggestion}`}
                {notice.reason ? ` — ${notice.reason}` : ""}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <ErrorBanner message={actionError} />
      {actionInfo ? (
        <div role="status" className="rounded-[10px] border border-add/30 bg-add-tint px-3 py-2 text-sm font-medium text-add">
          {actionInfo}
        </div>
      ) : null}

      {messages.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[14px] border border-hairline bg-surface px-4 py-12 text-center">
          <p className="text-sm text-muted">Không còn tin nhắn chưa phân loại nào.</p>
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-[10px] border border-hairline bg-surface px-3 text-sm font-medium text-ink hover:bg-ground"
          >
            Về danh sách khách hàng
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {messages.map((m) => {
            const chosen = selected[m.id] ?? "";
            const msgBusy = busyKey === "msg:" + m.id;
            const contactBusy = m.contact ? busyKey === "contact:" + m.contact : false;
            const sameContact = m.contact ? (contactCounts.get(m.contact) ?? 0) : 0;
            const isEmailContact = !!m.contact && EMAIL_RE.test(m.contact.trim());
            return (
              <li key={m.id} className="flex flex-col gap-3 rounded-[14px] border border-hairline bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`${badgeBase} bg-ground text-ink`}>{channelLabel(m.channel)}</span>
                  <span className={`${badgeBase} bg-ground text-muted`}>{senderLabel(m.sender)}</span>
                  {m.contact ? <span className="tabular text-xs text-muted">{m.contact}</span> : null}
                  <span className="tabular ml-auto text-xs text-muted">{formatDateTime(m.sentAt)}</span>
                  {m.sourceImage ? (
                    <a href={m.sourceImage} target="_blank" rel="noopener noreferrer" title="Mở ảnh gốc">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={m.sourceImage}
                        alt="Ảnh chụp gốc"
                        className="h-10 w-10 rounded-md border border-hairline object-cover"
                      />
                    </a>
                  ) : null}
                </div>

                <p className="whitespace-pre-wrap text-sm text-ink">{m.text}</p>

                {isEmailContact && m.contact ? (
                  <>
                    <div className="flex flex-col gap-2 rounded-[10px] border border-accent/30 bg-add-tint px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm">
                        <div className="font-medium text-ink">Email mới chưa có trong danh bạ khách hàng</div>
                        <div className="text-xs text-muted">
                          {sameContact > 1
                            ? `Có ${sameContact} email từ ${m.contact} sẽ được gom tự động để dựng v1.`
                            : `Tạo hồ sơ khách với ${m.contact} để tự động gom email dựng v1.`}
                        </div>
                      </div>
                      <Link
                        href={newClientHref(m.contact)}
                        className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-accent px-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                      >
                        <UserPlus className="size-4" />
                        Tạo khách &amp; dựng v1 ngay
                      </Link>
                    </div>

                    <div className="flex flex-col gap-2 border-t border-hairline pt-2 sm:flex-row sm:items-center">
                      <span className="text-xs text-muted sm:shrink-0">Hoặc đây là email phụ của khách cũ?</span>
                      <select
                        value={chosen}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [m.id]: e.target.value }))}
                        aria-label="Chọn khách hàng"
                        className="h-10 min-w-0 flex-1 rounded-[10px] border border-hairline bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <option value="">Chọn khách hàng...</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.projectName ? `${c.name} — ${c.projectName}` : c.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!chosen || busyKey !== null}
                        onClick={() => void assignOne(m.id, chosen)}
                      >
                        {msgBusy ? "Đang lưu..." : "Lưu email & gán"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    {m.suggestedClientId && m.suggestedClientName ? (
                      <div className="flex flex-col gap-2 rounded-[10px] border border-accent/30 bg-add-tint px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-2 text-sm">
                          <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" />
                          <div>
                            <div className="font-medium text-ink">{`AI gợi ý: ${m.suggestedClientName}`}</div>
                            {m.suggestedReason ? <div className="text-xs text-muted">{m.suggestedReason}</div> : null}
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          disabled={busyKey !== null}
                          onClick={() => void assignOne(m.id, m.suggestedClientId as string)}
                        >
                          {msgBusy ? "Đang gán..." : `Gán cho ${m.suggestedClientName}`}
                        </Button>
                      </div>
                    ) : null}

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <select
                        value={chosen}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [m.id]: e.target.value }))}
                        aria-label="Chọn khách hàng"
                        className="h-11 min-w-0 flex-1 rounded-[10px] border border-hairline bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <option value="">Chọn khách hàng để gán...</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.projectName ? `${c.name} — ${c.projectName}` : c.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!chosen || busyKey !== null}
                        onClick={() => void assignOne(m.id, chosen)}
                      >
                        {msgBusy ? "Đang gán..." : "Gán"}
                      </Button>
                    </div>

                    {m.contact ? (
                      <div className="flex flex-col gap-2 border-t border-hairline pt-3 sm:flex-row sm:items-center">
                        <Link
                          href={newClientHref(m.contact)}
                          className="inline-flex h-11 items-center justify-center gap-1 rounded-[10px] border border-accent/40 px-3 text-sm font-medium text-accent hover:bg-add-tint"
                        >
                          <UserPlus className="size-4" />
                          Tạo khách mới &amp; tự dựng v1
                        </Link>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!chosen || busyKey !== null}
                          onClick={() => void assignContact(m.contact as string, chosen)}
                        >
                          {contactBusy
                            ? "Đang gán..."
                            : `Gán tất cả tin từ ${m.contact}${sameContact > 1 ? ` (${sameContact})` : ""}`}
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
