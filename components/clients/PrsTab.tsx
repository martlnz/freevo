import Link from "next/link";
import { badgeBase, confirmationClass, confirmationLabel, formatDateTime, prStatusClass, prStatusLabel, type PrView } from "./shared";

export function PrsTab({ prs }: { prs: PrView[] }) {
  if (prs.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-hairline bg-surface px-6 py-10 text-center text-sm text-muted">
        Chưa có Pull Request nào. Bấm “Tổng hợp phiên” ở hộp tin để tạo PR đầu tiên.
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {prs.map((pr) => (
        <li key={pr.id}>
          <Link
            href={`/pr/${pr.id}`}
            className="block rounded-[10px] border border-hairline bg-surface p-4 transition-colors hover:bg-ground"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${badgeBase} ${prStatusClass(pr.status)}`}>
                {prStatusLabel(pr.status, pr.mergedVersionNo)}
              </span>
              {pr.status === "merged" && pr.confirmation ? (
                <span className={`${badgeBase} ${confirmationClass(pr.confirmation.status)}`}>
                  {confirmationLabel(pr.confirmation.status)}
                </span>
              ) : null}
              <span className="ml-auto text-xs text-muted tabular">{formatDateTime(pr.createdAt)}</span>
            </div>
            <p className="mt-2 text-sm text-ink">{pr.summary || "Chưa có tóm tắt."}</p>
            <p className="mt-2 text-xs text-muted tabular">
              {pr.changeCount} thay đổi · Khối lượng {pr.effortDelta >= 0 ? "+" : ""}
              {pr.effortDelta} điểm
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
