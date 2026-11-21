import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { formatVND } from "@/components/MoneyBlock";
import { AddMessageForm } from "@/components/clients/AddMessageForm";
import { ClientSpine } from "@/components/clients/ClientSpine";
import { CreatePRButton } from "@/components/clients/CreatePRButton";
import { getClientDetail } from "@/lib/clients";
import { listPendingMessages } from "@/lib/messages";

export const dynamic = "force-dynamic";

const CHANNEL: Record<string, string> = { zalo: "Zalo", gmail: "email", manual: "nhập tay" };
const fmtTime = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh", hour12: false });
const fmtDay = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
const fmtMsg = (d: Date) => `${fmtTime.format(d)}, ${fmtDay.format(d).replace("-", "/")}`;
const fmtDate = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let d;
  try {
    d = await getClientDetail(id);
  } catch (e) {
    if (e instanceof Error && e.message.includes("Không tìm thấy")) notFound();
    return (
      <AppShell>
        <p role="alert" className="rounded-[10px] border border-remove bg-remove-tint p-4 font-medium text-remove">
          {e instanceof Error ? e.message : "Không tải được dữ liệu khách hàng."}
        </p>
        <Link href="/" className="mt-4 inline-block text-accent underline-offset-4 hover:underline">Về danh sách khách</Link>
      </AppShell>
    );
  }
  const messages = await listPendingMessages(id);
  const current = d.versions[0];
  const openPR = d.prs.find((p) => p.status === "open");
  const canCreate = messages.length > 0;
  const channels = [...new Set(messages.map((m) => CHANNEL[m.channel] ?? m.channel))];

  return (
    <AppShell>
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end sm:gap-6">
        <div className="min-w-0">
          <p className="mb-2 text-sm text-muted">
            <Link href="/" className="hover:underline">Khách hàng</Link> / <b className="font-medium text-ink">{d.name}</b>
          </p>
          <h1 className="break-words text-2xl font-semibold leading-tight tracking-[-0.02em] sm:text-[32px]">{d.name}</h1>
          <p className="mt-2 max-w-[60ch] text-muted">
            {d.projectName ? `${d.projectName}. ` : ""}Bản hiện tại v{current?.number ?? 1}, hợp đồng <span className="tabular">{formatVND(d.contractPrice)}</span>.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          {openPR && (
            <Link href={`/pr/${openPR.id}`} className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-hairline bg-surface px-4 text-sm font-medium hover:bg-ground">
              Mở PR đang chờ duyệt
            </Link>
          )}
          <CreatePRButton clientId={id} disabled={!canCreate} />
        </div>
      </div>

      <div className="grid items-start gap-10 lg:grid-cols-[1fr_360px] lg:gap-12">
        <section>
          <h2 className="mb-2 text-xl font-semibold tracking-tight">Tin nhắn chưa xử lý</h2>
          <p className="mb-4 text-[13px] text-muted">
            {messages.length > 0
              ? `${messages.length} tin từ ${channels.join(" và ")}, sẽ được gom vào một đề xuất.`
              : "Chưa có tin nhắn mới. Tin từ Zalo, email hoặc nhập tay sẽ hiện ở đây."}
          </p>
          {messages.length > 0 && (
            <div className="rounded-[10px] border border-hairline bg-surface px-4 py-2 sm:px-6">
              {messages.map((m) => (
                <div key={m.id} className="border-t border-hairline py-4 first:border-t-0">
                  <div className="flex justify-between gap-3 text-[13px] text-muted">
                    <b className="font-semibold text-ink">{m.sender === "client" ? d.name : m.sender === "freelancer" ? "Bạn" : "Không rõ người gửi"}</b>
                    <span className="tabular shrink-0">{CHANNEL[m.channel]?.replace(/^./, (c) => c.toUpperCase()) ?? m.channel}, {fmtMsg(m.sentAt)}</span>
                  </div>
                  <p className="mt-1 max-w-[68ch] whitespace-pre-wrap break-words">{m.text}</p>
                </div>
              ))}
            </div>
          )}
          <AddMessageForm clientId={id} clientName={d.name} />
        </section>

        <aside>
          <h2 className="mb-4 text-xl font-semibold tracking-tight">Lịch sử phiên bản</h2>
          <div className="rounded-[10px] border border-hairline bg-surface p-6">
            <ClientSpine
              currentNo={current?.number ?? 1}
              openPR={openPR ? { id: openPR.id, title: "Đề xuất bởi AI, chưa duyệt" } : undefined}
              versions={d.versions.map((v) => ({ no: v.number, note: v.note ?? undefined, date: fmtDate.format(v.createdAt) }))}
            />
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
