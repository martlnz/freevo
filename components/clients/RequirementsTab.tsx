import type { Req } from "@/lib/types";
import { badgeBase, reqStatusClass, reqStatusLabel } from "./shared";

export function RequirementsTab({ requirements }: { requirements: Req[] }) {
  if (requirements.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-hairline bg-surface px-6 py-10 text-center text-sm text-muted">
        Chưa có yêu cầu nào được chốt. Hãy tổng hợp phiên chat và merge PR đầu tiên.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-[10px] border border-hairline bg-surface">
      <div className="hidden grid-cols-[90px_minmax(0,1fr)_minmax(0,2fr)_100px] gap-4 border-b border-hairline bg-ground px-4 py-2 text-xs font-medium text-muted md:grid">
        <span>Mã</span>
        <span>Tiêu đề</span>
        <span>Chi tiết</span>
        <span>Trạng thái</span>
      </div>
      <ul className="divide-y divide-hairline">
        {requirements.map((r) => (
          <li
            key={r.id}
            className="grid gap-1 px-4 py-3 md:grid-cols-[90px_minmax(0,1fr)_minmax(0,2fr)_100px] md:items-start md:gap-4"
          >
            <span className="font-mono text-xs font-medium text-accent tabular">{r.id}</span>
            <span className="font-medium text-ink">{r.title}</span>
            <span className="whitespace-pre-wrap break-words text-sm text-muted">{r.detail || "—"}</span>
            <span>
              <span className={`${badgeBase} ${reqStatusClass(r.status)}`}>{reqStatusLabel(r.status)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
