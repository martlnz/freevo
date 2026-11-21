import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmationBadge } from "@/components/clients/ConfirmationBadge";
import { listClients } from "@/lib/clients";
import { countUnassignedMessages } from "@/lib/messages";
import { formatVND } from "@/lib/pricing-calc";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [clients, unassignedCount] = await Promise.all([listClients(), countUnassignedMessages()]);
  const withPending = clients.filter((c) => c.pendingCount > 0).length;
  const withOpenPr = clients.filter((c) => c.openPrCount > 0).length;

  return (
    <AppShell>
      {unassignedCount > 0 ? (
        <Link
          href="/inbox"
          className="mb-4 flex flex-col gap-1 rounded-[10px] border border-modify/30 bg-modify-tint px-4 py-3 text-sm font-medium text-modify transition-opacity hover:opacity-90 sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="tabular">Có {unassignedCount} tin nhắn chưa phân loại</span>
          <span className="underline underline-offset-2">Xem &amp; gán khách →</span>
        </Link>
      ) : null}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Khách hàng</h1>
          <p className="mt-1 text-sm text-muted tabular">
            {clients.length} khách · {withPending} khách có tin chờ · {withOpenPr} khách có PR đang mở
          </p>
        </div>
        <Link href="/clients/new" className={buttonVariants({ variant: "default" })}>
          + Khách mới
        </Link>
      </div>

      {clients.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-hairline bg-surface px-6 py-12 text-center">
          <p className="font-medium text-ink">Chưa có khách hàng nào</p>
          <p className="mt-1 text-sm text-muted">Tạo khách đầu tiên để bắt đầu theo dõi thay đổi yêu cầu.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-hairline bg-surface">
          <div className="hidden grid-cols-[minmax(0,2fr)_80px_110px_minmax(0,1.6fr)_140px] gap-4 border-b border-hairline bg-ground px-4 py-2 text-xs font-medium text-muted md:grid">
            <span>Khách hàng / Dự án</span>
            <span>Version</span>
            <span>Tin chờ</span>
            <span>PR mở</span>
            <span className="text-right">Ngân sách khách</span>
          </div>
          <ul className="divide-y divide-hairline">
            {clients.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/clients/${c.id}`}
                  className="grid gap-2 px-4 py-3 transition-colors hover:bg-ground md:grid-cols-[minmax(0,2fr)_80px_110px_minmax(0,1.6fr)_140px] md:items-center md:gap-4"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{c.name}</span>
                    <span className="block truncate text-sm text-muted">{c.projectName || "Chưa đặt tên dự án"}</span>
                  </span>
                  <span className="tabular text-sm text-ink">
                    <span className="mr-2 text-xs text-muted md:hidden">Version:</span>
                    {c.currentVersionNo > 0 ? (
                      <>v{c.currentVersionNo}</>
                    ) : (
                      <span className="text-muted">Chưa chốt v1</span>
                    )}
                  </span>
                  <span className="text-sm">
                    <span className="mr-2 text-xs text-muted md:hidden">Tin chờ:</span>
                    {c.pendingCount > 0 ? (
                      <span className="inline-flex items-center rounded-md bg-modify-tint px-2 py-0.5 text-xs font-medium text-modify tabular">
                        {c.pendingCount} tin chờ
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="mr-0 text-xs text-muted md:hidden">PR mở:</span>
                    {c.openPrCount > 0 ? (
                      <span className="inline-flex items-center rounded-md bg-add-tint px-2 py-0.5 text-xs font-medium text-add tabular">
                        {c.openPrCount} PR mở
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                    {c.latestConfirmationStatus ? <ConfirmationBadge status={c.latestConfirmationStatus} /> : null}
                    {c.currentEffort > 0 ? (
                      <span className="text-xs text-muted tabular">{c.currentEffort} điểm</span>
                    ) : null}
                  </span>
                  <span
                    className={`tabular text-sm md:text-right ${c.budget !== null ? "font-medium text-ink" : "text-muted"}`}
                  >
                    <span className="mr-2 text-xs font-normal text-muted md:hidden">Ngân sách:</span>
                    {c.budget !== null ? formatVND(c.budget) : "Chưa nêu"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AppShell>
  );
}
