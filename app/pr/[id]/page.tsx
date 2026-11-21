import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PRReviewClient } from "@/components/pr/PRReviewClient";
import type { PRStatus } from "@/components/pr/types";
import { getPR } from "@/lib/pr";
import { getSerializablePricing } from "@/lib/pricing";

export const dynamic = "force-dynamic";

function toStatus(s: string): PRStatus {
  return s === "merged" || s === "rejected" ? s : "open";
}

export default async function PRPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let pr: Awaited<ReturnType<typeof getPR>>;
  try {
    pr = await getPR(id);
  } catch {
    notFound();
  }

  const pricing = await getSerializablePricing(pr.clientId, pr.id);

  return (
    <AppShell>
      <PRReviewClient
        client={{ id: pr.client.id, name: pr.client.name }}
        pricing={pricing}
        pr={{
          id: pr.id,
          clientId: pr.clientId,
          status: toStatus(pr.status),
          changes: pr.changes,
          summary: pr.summary,
          effortDelta: pr.effortDelta,
          baseVersionNo: pr.baseVersionNo,
          mergedVersionNo: pr.mergedVersionNo,
          createdAt: pr.createdAt.toISOString(),
          mergedAt: pr.mergedAt ? pr.mergedAt.toISOString() : null,
          confirmation: pr.confirmation
            ? {
                token: pr.confirmation.token,
                status: pr.confirmation.status,
                respondedAt: pr.confirmation.respondedAt ? pr.confirmation.respondedAt.toISOString() : null,
              }
            : null,
          messages: pr.messages.map((m) => ({
            id: m.id,
            channel: m.channel,
            sender: m.sender,
            text: m.text,
            sentAt: m.sentAt.toISOString(),
            sourceImage: m.sourceImage ?? null,
          })),
        }}
      />
    </AppShell>
  );
}
