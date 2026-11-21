"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { rollbackAction } from "@/app/actions/pr";
import { ErrorBanner } from "./ErrorBanner";
import { RequirementsTab } from "./RequirementsTab";
import { badgeBase, formatDateTime, type VersionView } from "./shared";

export function VersionsTab({
  clientId,
  versions,
  latestVersionNo,
}: {
  clientId: string;
  versions: VersionView[];
  latestVersionNo: number;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [target, setTarget] = useState<VersionView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextNo = latestVersionNo + 1;

  function closeDialog() {
    if (loading) return;
    setTarget(null);
    setError(null);
  }

  async function confirmRollback() {
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      const res = await rollbackAction(clientId, target.number);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTarget(null);
      router.refresh();
    } catch {
      setError("Không thể rollback. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  if (versions.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-hairline bg-surface px-6 py-10 text-center text-sm text-muted">
        Chưa có version nào.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {versions.map((v) => {
          const isLatest = v.number === latestVersionNo;
          const open = expanded === v.number;
          return (
            <li key={v.id} className="rounded-[10px] border border-hairline bg-surface p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-ink tabular">v{v.number}</span>
                    {isLatest ? <span className={`${badgeBase} bg-add-tint text-add`}>Hiện tại</span> : null}
                    <span className="text-xs text-muted tabular">{formatDateTime(v.createdAt)}</span>
                  </div>
                  {v.note ? <p className="mt-1 text-sm text-muted">{v.note}</p> : null}
                  {v.prId ? (
                    <Link href={`/pr/${v.prId}`} className="mt-1 inline-block text-sm text-accent hover:underline">
                      Xem PR nguồn
                    </Link>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setExpanded(open ? null : v.number)}
                    aria-expanded={open}
                  >
                    {open ? "Ẩn nội dung" : "Xem nội dung"}
                  </Button>
                  {!isLatest ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setTarget(v)}>
                      <RotateCcw />
                      Rollback
                    </Button>
                  ) : null}
                </div>
              </div>
              {open ? (
                <div className="mt-4">
                  <RequirementsTab requirements={v.requirements} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <Dialog open={target !== null} onOpenChange={(o) => (o ? undefined : closeDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rollback về v{target?.number}?</DialogTitle>
            <DialogDescription>
              Hệ thống sẽ tạo v{nextNo} có nội dung giống v{target?.number}. Lịch sử cũ không bị xóa.
            </DialogDescription>
          </DialogHeader>
          <ErrorBanner message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog} disabled={loading}>
              Hủy
            </Button>
            <Button type="button" onClick={confirmRollback} disabled={loading}>
              {loading ? "Đang rollback..." : `Xác nhận tạo v${nextNo}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
