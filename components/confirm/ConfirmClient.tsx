"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { respondConfirmationAction } from "@/app/actions/pr";
import type { PRChange, Req } from "@/lib/types";

export type ConfirmStatus = "pending" | "confirmed" | "declined";

export type ConfirmMessage = {
  id: string;
  channel: "zalo" | "gmail" | "manual";
  sender: "client" | "freelancer" | "unknown";
  text: string;
  sentAt: string;
};

export type ConfirmVersion = {
  id: string;
  number: number;
  note: string | null;
  createdAt: string;
};

export type ConfirmData = {
  token: string;
  status: ConfirmStatus;
  note: string | null;
  respondedAt: string | null;
  versionNo: number | null;
  summary: string;
  client: { name: string; projectName: string | null };
  changes: PRChange[];
  requirements: Req[];
  messages: ConfirmMessage[];
  versions: ConfirmVersion[];
};

const CHANNEL_LABEL: Record<ConfirmMessage["channel"], string> = {
  zalo: "Zalo",
  gmail: "Gmail",
  manual: "Thủ công",
};

const SENDER_LABEL: Record<ConfirmMessage["sender"], string> = {
  client: "Khách",
  freelancer: "Freelancer",
  unknown: "Không rõ",
};

const OP_META: Record<PRChange["op"], { label: string; cls: string }> = {
  add: { label: "+ THÊM", cls: "bg-add-tint text-add" },
  modify: { label: "~ SỬA", cls: "bg-modify-tint text-modify" },
  remove: { label: "− XÓA", cls: "bg-remove-tint text-remove" },
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function SectionTitle({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-baseline gap-2 text-base font-semibold text-ink">
      <span className="tabular text-sm text-muted">{index}.</span>
      {children}
    </h2>
  );
}

function Evidence({ message }: { message: ConfirmMessage }) {
  return (
    <figure className="border-l-2 border-accent pl-3">
      <blockquote className="break-words text-sm text-ink">“{message.text}”</blockquote>
      <figcaption className="mt-1 text-xs text-muted">
        {SENDER_LABEL[message.sender]} · {CHANNEL_LABEL[message.channel]} ·{" "}
        <span className="tabular">{formatDateTime(message.sentAt)}</span>
      </figcaption>
    </figure>
  );
}

function ChangeCard({
  change,
  messagesById,
}: {
  change: PRChange;
  messagesById: Map<string, ConfirmMessage>;
}) {
  const meta = OP_META[change.op];
  const evidence = change.selectedEvidence
    .map((id) => messagesById.get(id))
    .filter((m): m is ConfirmMessage => m !== undefined);

  return (
    <li className="rounded-[10px] border border-hairline bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${meta.cls}`}>
          {meta.label}
        </span>
        {change.reqId && <span className="tabular text-xs text-muted">{change.reqId}</span>}
      </div>
      <p className="mt-2 break-words font-medium text-ink">{change.title ?? change.reqId ?? "Yêu cầu"}</p>
      {change.before && (
        <p className="mt-1 break-words text-sm text-muted line-through">{change.before}</p>
      )}
      {change.detail && (
        <p className="mt-1 break-words text-sm text-ink">
          {change.before ? "→ " : ""}
          {change.detail}
        </p>
      )}
      {change.reason && <p className="mt-2 text-sm text-muted">Lý do: {change.reason}</p>}
      {evidence.length > 0 && (
        <div className="mt-3 space-y-3 rounded-lg bg-ground p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Bằng chứng kèm theo
          </p>
          {evidence.map((m) => (
            <Evidence key={m.id} message={m} />
          ))}
        </div>
      )}
    </li>
  );
}

export function ConfirmClient({ data }: { data: ConfirmData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<ConfirmStatus>(data.status);
  const [note, setNote] = useState<string | null>(data.note);
  const [respondedAt, setRespondedAt] = useState<string | null>(data.respondedAt);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"approve" | "decline" | null>(null);

  const versionNo = data.versionNo ?? 1;
  const projectTitle = data.client.projectName || data.client.name;
  const acceptedChanges = data.changes.filter((c) => c.accepted);
  const messagesById = new Map(data.messages.map((m) => [m.id, m]));

  function submit(decision: "approve" | "decline") {
    setError(null);
    setHint(null);
    const text = comment.trim();
    if (decision === "decline" && text === "") {
      setHint("Vui lòng nhập nội dung phản hồi ngắn để freelancer biết cần chỉnh sửa điều gì.");
      return;
    }
    const formData = new FormData();
    formData.set("decision", decision);
    formData.set("comment", text);
    setSubmitting(decision);
    startTransition(async () => {
      try {
        const res = await respondConfirmationAction(data.token, formData);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setStatus(decision === "approve" ? "confirmed" : "declined");
        setNote(text === "" ? null : text);
        setRespondedAt(new Date().toISOString());
        router.refresh();
      } catch {
        setError("Không thể gửi phản hồi. Vui lòng thử lại sau.");
      } finally {
        setSubmitting(null);
      }
    });
  }

  return (
    <div className="min-h-dvh bg-ground text-ink">
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
        <main className="flex-1 space-y-8 px-4 pb-8 pt-6">
          <header className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              freevo · Xác nhận yêu cầu
            </p>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h1 className="break-words text-2xl font-semibold leading-tight">{projectTitle}</h1>
                <p className="mt-1 text-sm text-muted">Kính gửi: {data.client.name}</p>
              </div>
              <span className="tabular shrink-0 rounded-full border border-hairline bg-surface px-3 py-1 text-sm font-medium text-accent">
                Phiên bản v{versionNo}
              </span>
            </div>
            {data.summary && (
              <p className="rounded-[10px] border border-hairline bg-surface p-4 text-sm leading-relaxed">
                {data.summary}
              </p>
            )}
          </header>

          {status === "confirmed" && (
            <div
              role="status"
              className="flex gap-3 rounded-[10px] border border-add/30 bg-add-tint p-4 text-add"
            >
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div className="min-w-0 text-sm">
                <p className="font-semibold">Bạn đã đồng ý bản cập nhật v{versionNo}</p>
                {respondedAt && (
                  <p className="tabular mt-0.5">Lúc {formatDateTime(respondedAt)}</p>
                )}
                {note && <p className="mt-2 break-words">Ghi chú của bạn: {note}</p>}
              </div>
            </div>
          )}

          {status === "declined" && (
            <div
              role="status"
              className="flex gap-3 rounded-[10px] border border-modify/30 bg-modify-tint p-4 text-modify"
            >
              <MessageSquareWarning className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div className="min-w-0 text-sm">
                <p className="font-semibold">Bạn đã gửi phản hồi cần chỉnh sửa</p>
                {respondedAt && (
                  <p className="tabular mt-0.5">Lúc {formatDateTime(respondedAt)}</p>
                )}
                {note && <p className="mt-2 break-words">Nội dung đã gửi: {note}</p>}
              </div>
            </div>
          )}

          <section>
            <SectionTitle index={1}>Các thay đổi trong bản cập nhật này</SectionTitle>
            {acceptedChanges.length === 0 ? (
              <p className="rounded-[10px] border border-hairline bg-surface p-4 text-sm text-muted">
                Bản cập nhật này không có thay đổi nào cần xác nhận.
              </p>
            ) : (
              <ul className="space-y-3">
                {acceptedChanges.map((c, i) => (
                  <ChangeCard
                    key={`${c.reqId ?? "new"}-${i}`}
                    change={c}
                    messagesById={messagesById}
                  />
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionTitle index={2}>Danh sách yêu cầu đầy đủ (v{versionNo})</SectionTitle>
            {data.requirements.length === 0 ? (
              <p className="rounded-[10px] border border-hairline bg-surface p-4 text-sm text-muted">
                Chưa có yêu cầu nào trong phiên bản này.
              </p>
            ) : (
              <ul className="divide-y divide-hairline rounded-[10px] border border-hairline bg-surface">
                {data.requirements.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="tabular text-xs text-muted">{r.id}</p>
                      <p className="mt-0.5 break-words font-medium">{r.title}</p>
                      {r.detail && (
                        <p className="mt-1 break-words text-sm text-muted">{r.detail}</p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${
                        r.status === "agreed" ? "bg-add-tint text-add" : "bg-modify-tint text-modify"
                      }`}
                    >
                      {r.status === "agreed" ? "Đã chốt" : "Đang bàn"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.versions.length > 0 && (
            <section>
              <SectionTitle index={3}>Lịch sử phiên bản</SectionTitle>
              <ul className="divide-y divide-hairline rounded-[10px] border border-hairline bg-surface">
                {data.versions.map((v) => (
                  <li key={v.id} className="flex items-start gap-3 p-3 text-sm">
                    <span className="tabular w-8 shrink-0 font-semibold text-accent">v{v.number}</span>
                    <span className="min-w-0 flex-1 break-words text-muted">
                      {v.note || "Không có ghi chú"}
                    </span>
                    <span className="tabular shrink-0 text-xs text-muted">
                      {formatDate(v.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>

        {status === "pending" && (
          <div className="sticky bottom-0 border-t border-hairline bg-surface/95 px-4 py-3 backdrop-blur-xs">
            {error && (
              <div
                role="alert"
                className="mb-3 flex gap-2 rounded-lg border border-remove/30 bg-remove-tint p-3 text-sm text-remove"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">{error}</span>
              </div>
            )}
            {hint && (
              <div
                role="alert"
                className="mb-3 rounded-lg border border-modify/30 bg-modify-tint p-3 text-sm text-modify"
              >
                {hint}
              </div>
            )}
            <label htmlFor="confirm-comment" className="mb-1 block text-xs font-medium text-muted">
              Phản hồi hoặc ghi chú thêm (tùy chọn)
            </label>
            <Textarea
              id="confirm-comment"
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                if (hint) setHint(null);
              }}
              disabled={isPending}
              rows={2}
              className="max-h-32 min-h-16 bg-ground"
              placeholder="Ví dụ: Mục REQ-003 cần chỉnh lại..."
            />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row-reverse">
              <Button
                type="button"
                onClick={() => submit("approve")}
                disabled={isPending}
                className="sm:flex-1"
              >
                {submitting === "approve" ? "Đang gửi..." : "Tôi đồng ý"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => submit("decline")}
                disabled={isPending}
                className="sm:flex-1"
              >
                {submitting === "decline" ? "Đang gửi..." : "Cần chỉnh sửa / Gửi phản hồi"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
