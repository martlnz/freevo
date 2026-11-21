import { getByToken } from "@/lib/confirmations";
import { ConfirmClient } from "@/components/confirm/ConfirmClient";
import type { ConfirmData } from "@/components/confirm/ConfirmClient";

export const dynamic = "force-dynamic";

function InvalidLink() {
  return (
    <main className="min-h-dvh bg-ground px-4 py-16 text-ink">
      <div className="mx-auto max-w-md rounded-[10px] border border-hairline bg-surface p-6 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          freevo · Xác nhận yêu cầu
        </p>
        <h1 className="mt-3 text-xl font-semibold">
          Liên kết xác nhận không tồn tại hoặc đã hết hạn
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Vui lòng kiểm tra lại đường dẫn bạn đã nhận. Nếu vẫn không mở được, hãy liên hệ lại với
          freelancer đã gửi liên kết này để nhận một liên kết mới.
        </p>
      </div>
    </main>
  );
}

function normalizeStatus(status: string): ConfirmData["status"] {
  return status === "confirmed" || status === "declined" ? status : "pending";
}

function normalizeChannel(channel: string): "zalo" | "gmail" | "manual" {
  return channel === "zalo" || channel === "gmail" ? channel : "manual";
}

function normalizeSender(sender: string): "client" | "freelancer" | "unknown" {
  return sender === "client" || sender === "freelancer" ? sender : "unknown";
}

export default async function ConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let data: ConfirmData;
  try {
    const c = await getByToken(token);
    data = {
      token: c.token,
      status: normalizeStatus(c.status),
      note: c.note ?? null,
      respondedAt: c.respondedAt ? c.respondedAt.toISOString() : null,
      versionNo: c.versionNo ?? null,
      summary: c.pr.summary ?? "",
      client: {
        name: c.pr.client.name,
        projectName: c.pr.client.projectName ?? null,
      },
      changes: c.changes,
      requirements: c.snapshot.requirements,
      messages: c.messages.map((m) => ({
        id: m.id,
        channel: normalizeChannel(m.channel),
        sender: normalizeSender(m.sender),
        text: m.text,
        sentAt: m.sentAt.toISOString(),
      })),
      versions: c.versions.map((v) => ({
        id: v.id,
        number: v.number,
        note: v.note ?? null,
        createdAt: v.createdAt.toISOString(),
      })),
    };
  } catch {
    return <InvalidLink />;
  }

  return <ConfirmClient data={data} />;
}
