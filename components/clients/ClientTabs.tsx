"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InboxTab } from "./InboxTab";
import { InfoTab } from "./InfoTab";
import { PrsTab } from "./PrsTab";
import { RequirementsTab } from "./RequirementsTab";
import { VersionsTab } from "./VersionsTab";
import type { ClientView, MessageView } from "./shared";

const triggerClass =
  "h-10 flex-none rounded-none border-0 border-b-2 border-transparent px-3 text-muted data-[state=active]:border-accent data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-none";

export function ClientTabs({ client, messages }: { client: ClientView; messages: MessageView[] }) {
  return (
    <Tabs defaultValue="inbox" className="gap-4">
      <div className="overflow-x-auto">
        <TabsList variant="line" className="h-auto w-full min-w-max justify-start rounded-none border-b border-hairline p-0">
          <TabsTrigger value="inbox" className={triggerClass}>
            Hộp tin
          </TabsTrigger>
          <TabsTrigger value="requirements" className={triggerClass}>
            Yêu cầu hiện tại
          </TabsTrigger>
          <TabsTrigger value="versions" className={triggerClass}>
            Lịch sử version
          </TabsTrigger>
          <TabsTrigger value="prs" className={triggerClass}>
            PR
          </TabsTrigger>
          <TabsTrigger value="info" className={triggerClass}>
            Thông tin
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="inbox">
        <InboxTab clientId={client.id} pendingCount={client.pendingCount} messages={messages} />
      </TabsContent>
      <TabsContent value="requirements">
        <RequirementsTab requirements={client.requirements} />
      </TabsContent>
      <TabsContent value="versions">
        <VersionsTab clientId={client.id} versions={client.versions} latestVersionNo={client.latestVersionNo} />
      </TabsContent>
      <TabsContent value="prs">
        <PrsTab prs={client.prs} />
      </TabsContent>
      <TabsContent value="info">
        <InfoTab client={client} />
      </TabsContent>
    </Tabs>
  );
}
