import { AppShell } from "@/components/AppShell";
import { InboxUnassignedClient } from "@/components/inbox/InboxUnassignedClient";
import { listClients } from "@/lib/clients";
import { listUnassignedMessages } from "@/lib/messages";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const [messages, clients] = await Promise.all([listUnassignedMessages(), listClients()]);

  return (
    <AppShell>
      <InboxUnassignedClient
        messages={messages.map((m) => ({
          id: m.id,
          channel: m.channel,
          sender: m.sender,
          text: m.text,
          contact: m.contact ?? null,
          sourceImage: m.sourceImage ?? null,
          suggestedClientId: m.suggestedClientId ?? null,
          suggestedClientName: m.suggestedClientName ?? null,
          suggestedReason: m.suggestedReason ?? null,
          sentAt: m.sentAt.toISOString(),
        }))}
        clients={clients.map((c) => ({ id: c.id, name: c.name, projectName: c.projectName ?? null }))}
      />
    </AppShell>
  );
}
