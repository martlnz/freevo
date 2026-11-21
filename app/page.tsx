import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { NewClientDialog } from "@/components/clients/NewClientDialog";
import { formatVND } from "@/components/MoneyBlock";
import { getClientDetail, listClients } from "@/lib/clients";
import type { PRChange } from "@/lib/types";

export const dynamic = "force-dynamic";

type Tone = "wait" | "ok" | "none";
type Detail = Awaited<ReturnType<typeof getClientDetail>>;
type St = { text: string; tone: Tone; urgent: boolean };

function status(d: Detail): St {
  const open = d.prs.find((p) => p.status === "open");
  if (open) {
    const n = (JSON.parse(open.changes) as PRChange[]).length;
    return { text: `Đang chờ bạn duyệt đề xuất, ${n} thay đổi`, tone: "wait", urgent: true };
  }
  if (d.pendingCount > 0) return { text: `Có ${d.pendingCount} tin mới, chưa tạo PR`, tone: "wait", urgent: true };
  const merged = d.prs.find((p) => p.status === "merged" && p.confirmation);
  const v = merged?.mergedVersionNo ?? d.versions[0]?.number;
  if (merged?.confirmation?.status === "pending") return { text: `Chờ khách xác nhận v${v}`, tone: "wait", urgent: false };
  if (merged?.confirmation?.status === "confirmed") return { text: `Khách đã đồng ý v${v}`, tone: "ok", urgent: false };
  if (merged?.confirmation?.status === "declined") return { text: `Khách cần sửa lại v${v}`, tone: "wait", urgent: true };
  return { text: "Không có việc cần làm", tone: "none", urgent: false };
}

const TONE: Record<Tone, string> = { wait: "text-modify", ok: "text-add", none: "text-muted" };
const word = ["Không", "Một", "Hai", "Ba", "Bốn", "Năm", "Sáu", "Bảy", "Tám", "Chín"];

export default async function Home() {
  let rows: { id: string; name: string; projectName: string | null; contractPrice: number; st: St }[] = [];
  let error: string | null = null;
  try {
    const clients = await listClients();
    const details = await Promise.all(clients.map((c) => getClientDetail(c.id)));
    rows = details.map((d) => ({ id: d.id, name: d.name, projectName: d.projectName, contractPrice: d.contractPrice, st: status(d) }));
  } catch (e) {
    error = e instanceof Error ? e.message : "Không tải được danh sách khách hàng.";
  }
  const waiting = rows.filter((r) => r.st.urgent).length;
  const sub = error
    ? ""
    : rows.length === 0
      ? "Chưa có khách nào. Thêm khách đầu tiên để bắt đầu."
      : waiting > 0
        ? `${word[waiting] ?? waiting} khách đang chờ bạn.`
        : "Không có khách nào đang chờ bạn.";

  return (
    <AppShell>
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end sm:gap-6">
        <div>
          <p className="mb-2 text-sm text-muted">freevo</p>
          <h1 className="text-2xl font-semibold leading-tight tracking-[-0.02em] sm:text-[32px]">Khách hàng</h1>
          {sub && <p className="mt-2 max-w-[60ch] text-muted">{sub}</p>}
        </div>
        <NewClientDialog />
      </div>

      {error && <p role="alert" className="rounded-[10px] border border-remove bg-remove-tint p-4 font-medium text-remove">{error}</p>}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-[10px] border border-hairline bg-surface">
          <div className="hidden grid-cols-[1.3fr_1.6fr_1fr_140px] gap-6 px-6 py-3 text-[13px] text-muted sm:grid">
            <span>Khách</span>
            <span>Trạng thái</span>
            <span className="text-right">Giá trị</span>
            <span />
          </div>
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/clients/${r.id}`}
              className="grid min-h-[72px] grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-t border-hairline px-4 py-4 hover:bg-ground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:grid-cols-[1.3fr_1.6fr_1fr_140px] sm:gap-6 sm:px-6 sm:py-5"
            >
              <span className="col-start-1 row-start-1 min-w-0 sm:row-start-auto">
                <span className="block break-words font-semibold">{r.name}</span>
                {r.projectName && <span className="hidden break-words text-[13px] text-muted sm:block">{r.projectName}</span>}
              </span>
              {r.projectName && <span className="col-span-2 row-start-2 break-words text-sm text-muted sm:hidden">{r.projectName}</span>}
              <span className={`col-span-2 row-start-3 font-medium sm:col-span-1 sm:row-start-auto ${TONE[r.st.tone]}`}>{r.st.text}</span>
              <span className="tabular col-start-2 row-start-1 whitespace-nowrap text-right font-semibold sm:col-start-auto sm:row-start-auto">{formatVND(r.contractPrice)}</span>
              <span className="hidden text-right text-[13px] text-muted sm:block">Mở</span>
            </Link>
          ))}
        </div>
      )}
      {rows.length > 0 && <p className="mt-4 text-[13px] text-muted">Giá trị đã gồm thuế 10%.</p>}
    </AppShell>
  );
}
