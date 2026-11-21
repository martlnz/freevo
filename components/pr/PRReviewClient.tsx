"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Copy, ExternalLink, GitMerge } from "lucide-react";
import { mergePRAction, rejectPRAction, updateChangeAction } from "@/app/actions/pr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PRChange, SerializablePricing } from "@/lib/types";
import { EvidenceBubble } from "./EvidenceBubble";
import { PricingPanel } from "./PricingPanel";
import type { PRStatus, SerializedClient, SerializedPR } from "./types";

type MergeInfo = { versionNo: number; token: string; confirmUrl: string };

const noopSubscribe = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => "";

const OP_META: Record<PRChange["op"], { label: string; className: string }> = {
  add: { label: "+ THÊM", className: "bg-add-tint text-add" },
  modify: { label: "~ SỬA", className: "bg-modify-tint text-modify" },
  remove: { label: "− XÓA", className: "bg-remove-tint text-remove" },
};

export function PRReviewClient({
  pr,
  client,
  pricing,
}: {
  pr: SerializedPR;
  client: SerializedClient;
  pricing: SerializablePricing;
}) {
  const router = useRouter();
  const [changes, setChanges] = useState<PRChange[]>(pr.changes);
  const [pendingIdx, setPendingIdx] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [mergeInfo, setMergeInfo] = useState<MergeInfo | null>(null);
  const [localStatus, setLocalStatus] = useState<PRStatus | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useSyncExternalStore(noopSubscribe, getOrigin, getServerOrigin);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const status: PRStatus = mergeInfo ? "merged" : (localStatus ?? pr.status);
  const isOpen = status === "open";
  const baseNo = pr.baseVersionNo ?? 0;
  const targetNo = pr.mergedVersionNo ?? baseNo + 1;
  const mergedNo = mergeInfo?.versionNo ?? pr.mergedVersionNo ?? targetNo;

  const counts = changes.reduce(
    (acc, c) => {
      acc[c.op] += 1;
      return acc;
    },
    { add: 0, modify: 0, remove: 0 },
  );
  const acceptedCount = changes.filter((c) => c.accepted).length;
  const messageById = new Map(pr.messages.map((m) => [m.id, m]));

  const token = mergeInfo?.token ?? pr.confirmation?.token ?? null;
  const showConfirm = status === "merged" && token !== null;
  const confirmPath = token ? `/c/${token}` : "";
  const shareUrl = mergeInfo?.confirmUrl ?? (origin ? `${origin}${confirmPath}` : confirmPath);

  const patchChange = useCallback(
    async (index: number, patch: Partial<Pick<PRChange, "accepted" | "selectedEvidence">>) => {
      const prev = changes[index];
      if (!prev) return;
      setError(null);
      setPendingIdx((p) => [...p, index]);
      setChanges((cur) => cur.map((c, i) => (i === index ? { ...c, ...patch } : c)));
      const res = await updateChangeAction(pr.id, index, patch);
      setPendingIdx((p) => p.filter((i) => i !== index));
      if (!res.ok) {
        setChanges((cur) =>
          cur.map((c, i) =>
            i === index
              ? {
                  ...c,
                  accepted: patch.accepted !== undefined ? prev.accepted : c.accepted,
                  selectedEvidence: patch.selectedEvidence !== undefined ? prev.selectedEvidence : c.selectedEvidence,
                }
              : c,
          ),
        );
        setError(res.error);
      }
    },
    [changes, pr.id],
  );

  async function handleMerge() {
    setError(null);
    setMerging(true);
    const res = await mergePRAction(pr.id);
    setMerging(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setMergeInfo(res.data);
    router.refresh();
  }

  async function handleReject() {
    setError(null);
    setRejecting(true);
    const res = await rejectPRAction(pr.id);
    setRejecting(false);
    setRejectOpen(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setLocalStatus("rejected");
    router.refresh();
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Không thể sao chép link. Hãy chọn và sao chép thủ công.");
    }
  }

  const statusBadge =
    status === "open"
      ? { text: "Đang mở", className: "bg-modify-tint text-modify" }
      : status === "merged"
        ? { text: `Đã merge v${mergedNo}`, className: "bg-add-tint text-add" }
        : { text: "Đã từ chối", className: "bg-remove-tint text-remove" };

  return (
    <div>
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
        <Link href="/" className="hover:text-ink">
          Khách hàng
        </Link>
        <span>/</span>
        <Link href={`/clients/${client.id}`} className="hover:text-ink">
          {client.name}
        </Link>
        <span>/</span>
        <span className="text-ink">Duyệt PR</span>
      </nav>

      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Duyệt PR</h1>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge.className}`}>
            {statusBadge.text}
          </span>
        </div>
        {pr.summary ? <p className="mt-2 max-w-3xl text-base text-ink">{pr.summary}</p> : null}
        <div className="tabular mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span>
            {baseNo === 0
              ? status === "merged"
                ? "Đã tạo v1"
                : "Khởi tạo phiên bản v1"
              : `Phiên bản v${baseNo} → v${targetNo}`}
          </span>
          <span>
            <span className="text-add">+{counts.add} thêm</span> · <span className="text-modify">~{counts.modify} sửa</span> ·{" "}
            <span className="text-remove">−{counts.remove} xóa</span>
          </span>
          <span>
            {acceptedCount}/{changes.length} thay đổi được chọn
          </span>
        </div>
      </header>

      {error ? (
        <div role="alert" className="mt-5 flex items-start gap-2 rounded-[10px] border border-remove/30 bg-remove-tint px-4 py-3 text-sm text-remove">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="font-medium underline underline-offset-2">
            Đóng
          </button>
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <ul className="space-y-4">
            {changes.map((change, index) => {
              const meta = OP_META[change.op];
              const pending = pendingIdx.includes(index);
              const locked = !isOpen || pending;
              const evidenceMessages = change.evidence.flatMap((id) => {
                const m = messageById.get(id);
                return m ? [m] : [];
              });
              return (
                <li
                  key={`${index}-${change.reqId ?? "new"}`}
                  className={`rounded-[10px] border border-hairline bg-surface p-4 sm:p-5 ${change.accepted ? "" : "opacity-60"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded px-2 py-0.5 text-xs font-bold ${meta.className}`}>{meta.label}</span>
                        {change.reqId ? <span className="tabular text-xs font-medium text-muted">{change.reqId}</span> : null}
                        {change.status ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              change.status === "agreed" ? "bg-add-tint text-add" : "bg-modify-tint text-modify"
                            }`}
                          >
                            {change.status === "agreed" ? "Đã chốt" : "Đang bàn"}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="mt-2 text-base font-semibold text-ink">{change.title ?? change.reqId ?? "Thay đổi"}</h3>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={change.accepted}
                      disabled={locked}
                      onClick={() => void patchChange(index, { accepted: !change.accepted })}
                      className={`inline-flex min-h-11 items-center gap-2 rounded-[10px] border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        change.accepted ? "border-add/30 bg-add-tint text-add" : "border-hairline bg-ground text-muted"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`relative h-5 w-9 rounded-full transition-colors ${change.accepted ? "bg-add" : "bg-hairline"}`}
                      >
                        <span
                          className={`absolute top-0.5 size-4 rounded-full bg-surface transition-all ${
                            change.accepted ? "left-[18px]" : "left-0.5"
                          }`}
                        />
                      </span>
                      {change.accepted ? "Chấp nhận" : "Bỏ qua"}
                    </button>
                  </div>

                  {change.before || change.detail ? (
                    <div className="mt-3 space-y-1 text-sm">
                      {change.before ? <p className="text-muted line-through">{change.before}</p> : null}
                      {change.before && change.detail ? <p className="text-muted">→</p> : null}
                      {change.detail ? <p className="text-ink">{change.detail}</p> : null}
                    </div>
                  ) : null}

                  {change.reason ? (
                    <p className="mt-3 text-sm text-muted">
                      <span className="font-medium text-ink">Lý do AI: </span>
                      {change.reason}
                    </p>
                  ) : null}

                  {evidenceMessages.length > 0 ? (
                    <div className="mt-4 space-y-2 border-t border-hairline pt-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">
                        Bằng chứng ({change.selectedEvidence.length}/{evidenceMessages.length} được chọn)
                      </p>
                      {evidenceMessages.map((m) => {
                        const checked = change.selectedEvidence.includes(m.id);
                        return (
                          <EvidenceBubble
                            key={m.id}
                            message={m}
                            checked={checked}
                            disabled={locked}
                            onToggle={(next) => {
                              const nextSelected = next
                                ? [...change.selectedEvidence.filter((x) => x !== m.id), m.id]
                                : change.selectedEvidence.filter((x) => x !== m.id);
                              void patchChange(index, { selectedEvidence: nextSelected });
                            }}
                          />
                        );
                      })}
                    </div>
                  ) : null}
                </li>
              );
            })}
            {changes.length === 0 ? (
              <li className="rounded-[10px] border border-dashed border-hairline bg-surface p-6 text-center text-sm text-muted">
                PR này chưa có thay đổi nào.
              </li>
            ) : null}
          </ul>

          {isOpen ? (
            <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-hairline bg-surface p-4">
              <Button onClick={() => void handleMerge()} disabled={merging || pendingIdx.length > 0}>
                <GitMerge aria-hidden />
                {merging ? "Đang merge..." : baseNo === 0 ? "Merge tạo v1" : `Merge thành v${baseNo + 1}`}
              </Button>
              <Button variant="outline" onClick={() => setRejectOpen(true)} disabled={merging}>
                Từ chối PR
              </Button>
              <p className="text-sm text-muted">Chỉ các thay đổi được chấp nhận mới đi vào phiên bản mới.</p>
            </div>
          ) : null}

          {showConfirm ? (
            <div className="rounded-[10px] border border-add/30 bg-add-tint p-5">
              <p className="flex items-center gap-2 text-base font-semibold text-add">
                <Check className="size-5" aria-hidden />
                Đã merge thành công thành v{mergedNo}
              </p>
              <p className="mt-2 text-sm text-ink">Gửi link xác nhận này cho khách để họ duyệt phiên bản mới:</p>
              <p className="mt-2 break-all rounded-[10px] border border-hairline bg-surface px-3 py-2 text-sm text-ink" suppressHydrationWarning>
                {shareUrl}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => void handleCopy()}>
                  {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                  {copied ? "Đã sao chép" : "Copy link"}
                </Button>
                <Button asChild>
                  <a href={confirmPath} target="_blank" rel="noreferrer">
                    <ExternalLink aria-hidden />
                    Mở trang khách
                  </a>
                </Button>
              </div>
            </div>
          ) : null}

          {status === "rejected" ? (
            <div className="rounded-[10px] border border-remove/30 bg-remove-tint p-4 text-sm text-remove">
              PR này đã bị từ chối, không có phiên bản mới nào được tạo.
            </div>
          ) : null}
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <PricingPanel pricing={pricing} />
        </div>
      </div>

      <Dialog open={rejectOpen} onOpenChange={(o) => (!rejecting ? setRejectOpen(o) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Từ chối PR này?</DialogTitle>
            <DialogDescription>
              Các thay đổi sẽ không được áp dụng và không tạo phiên bản mới. Bạn không thể hoàn tác thao tác này.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={rejecting}>
              Hủy
            </Button>
            <Button variant="destructive" onClick={() => void handleReject()} disabled={rejecting}>
              {rejecting ? "Đang từ chối..." : "Xác nhận từ chối"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
