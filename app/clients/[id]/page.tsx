import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { buttonVariants } from "@/components/ui/button";
import { ClientTabs } from "@/components/clients/ClientTabs";
import { ConfirmLinkActions, ConfirmationBadge } from "@/components/clients/ConfirmationBadge";
import { CreatePRButton } from "@/components/clients/CreatePRButton";
import { badgeBase, type ClientView, type MessageView } from "@/components/clients/shared";
import { getClientDetail } from "@/lib/clients";
import { listMessages } from "@/lib/messages";
import { formatVND } from "@/lib/pricing-calc";
import type { Req } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseRequirements(snapshot: string): Req[] {
  try {
    const v = JSON.parse(snapshot) as { requirements?: Req[] } | null;
    const reqs = v ? v.requirements : undefined;
    return Array.isArray(reqs) ? reqs : [];
  } catch {
    return [];
  }
}

function countChanges(changes: string): number {
  try {
    const v = JSON.parse(changes) as unknown;
    return Array.isArray(v) ? v.length : 0;
  } catch {
    return 0;
  }
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof getClientDetail>>;
  try {
    detail = await getClientDetail(id);
  } catch {
    notFound();
  }
  const rows = await listMessages(id);

  const messages: MessageView[] = rows.map((m) => ({
    id: m.id,
    channel: m.channel,
    sender: m.sender,
    text: m.text,
    sentAt: m.sentAt.toISOString(),
    prId: m.prId,
    sourceImage: m.sourceImage ?? null,
  }));

  const latestVersionNo = detail.versions[0]?.number ?? 0;
  const conf = detail.latestConfirmation;

  const client: ClientView = {
    id: detail.id,
    name: detail.name,
    projectName: detail.projectName,
    phone: detail.phone,
    emails: detail.emails,
    zaloId: detail.zaloId,
    note: detail.note,
    budget: detail.budget,
    currentEffort: detail.currentEffort,
    pendingCount: detail.pendingCount,
    latestVersionNo,
    requirements: detail.latestSnapshot.requirements ?? [],
    versions: detail.versions.map((v) => ({
      id: v.id,
      number: v.number,
      note: v.note,
      prId: v.prId,
      createdAt: v.createdAt.toISOString(),
      requirements: parseRequirements(v.snapshot),
    })),
    prs: detail.prs.map((p) => ({
      id: p.id,
      status: p.status,
      summary: p.summary,
      effortDelta: p.effortDelta,
      changeCount: countChanges(p.changes),
      mergedVersionNo: p.mergedVersionNo,
      createdAt: p.createdAt.toISOString(),
      mergedAt: p.mergedAt ? p.mergedAt.toISOString() : null,
      confirmation: p.confirmation ? { token: p.confirmation.token, status: p.confirmation.status } : null,
    })),
    latestConfirmation: conf
      ? {
          prId: conf.prId,
          mergedVersionNo: conf.mergedVersionNo,
          token: conf.token,
          status: conf.status,
          note: conf.note,
          respondedAt: conf.respondedAt ? conf.respondedAt.toISOString() : null,
        }
      : null,
  };

  const openPr = client.prs.find((p) => p.status === "open");

  return (
    <AppShell>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <Link href="/" className="hover:text-ink">
          Khách hàng
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink">{client.name}</span>
      </nav>

      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-ink">{client.name}</h1>
              <span className={`${badgeBase} bg-ground text-ink border border-hairline tabular`}>
                {client.latestVersionNo > 0 ? `v${client.latestVersionNo}` : "Chưa có v1"}
              </span>
              {client.latestConfirmation ? <ConfirmationBadge status={client.latestConfirmation.status} /> : null}
            </div>
            <p className="mt-1 text-sm text-muted">{client.projectName || "Chưa đặt tên dự án"}</p>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted tabular">
              <span>Ngân sách: {client.budget ? formatVND(client.budget) : "Chưa nêu"}</span>
              <span>Khối lượng: {client.currentEffort} điểm</span>
            </p>
            {client.latestConfirmation ? (
              <div className="mt-3">
                <ConfirmLinkActions token={client.latestConfirmation.token} />
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            {client.pendingCount > 0 ? <CreatePRButton clientId={client.id} /> : null}
            {openPr ? (
              <Link href={`/pr/${openPr.id}`} className={buttonVariants({ variant: "outline" })}>
                Xem PR đang mở
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <ClientTabs client={client} messages={messages} />
    </AppShell>
  );
}
