"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import PageHeader from "@/components/data-integrations/PageHeader";
import Tabs, { TabKey } from "@/components/data-integrations/Tabs";
import ConnectionsTab from "@/components/data-integrations/tabs/ConnectionsTab";
import SyncLogsTab from "@/components/data-integrations/tabs/SyncLogsTab";
import ApiKeysTab from "@/components/data-integrations/tabs/ApiKeysTab";
import WebhooksTab from "@/components/data-integrations/tabs/WebhooksTab";

export default function DataIntegrationsPage() {
  const [tab, setTab] = useState<TabKey>("connections");
  const [search, setSearch] = useState("");

  const connectionsQuery = trpc.integrations.connections.list.useQuery();
  const syncLogsQuery = trpc.integrations.syncLogs.list.useQuery();
  const webhooksQuery = trpc.integrations.webhooks.list.useQuery();

  const connections = useMemo(() => connectionsQuery.data ?? [], [connectionsQuery.data]);
  const logs = useMemo(() => syncLogsQuery.data ?? [], [syncLogsQuery.data]);
  const webhooks = useMemo(() => webhooksQuery.data ?? [], [webhooksQuery.data]);

  const connectedCount = connections.filter((c) => c.status === "CONNECTED").length;
  const errorCount = connections.filter((c) => c.status === "ERROR").length;
  const activeWebhooks = webhooks.filter((w) => w.active).length;
  const todayLabel = new Date().toDateString();
  const recordsToday = logs
    .filter((l) => new Date(l.createdAt).toDateString() === todayLabel)
    .reduce((sum, l) => sum + (l.recordsIn ?? 0) + (l.recordsOut ?? 0), 0);

  const badges: Record<TabKey, number> = {
    connections: connections.filter((c) => c.status === "ERROR").length,
    logs: logs.filter((l) => l.status === "FAILED").length,
    keys: 0,
    webhooks: webhooks.filter((w) => w.successRate < 90).length,
  };

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
      <PageHeader
        connectedCount={connectedCount}
        totalCount={connections.length}
        errorCount={errorCount}
        recordsToday={`${Math.round(recordsToday / 1000)}K`}
        activeWebhooks={activeWebhooks}
        search={search}
        onSearch={setSearch}
      />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <Tabs active={tab} onChange={setTab} badges={badges} />
        <div className="p-5">
          {tab === "connections" && <ConnectionsTab search={search} />}
          {tab === "logs" && <SyncLogsTab search={search} />}
          {tab === "keys" && <ApiKeysTab search={search} />}
          {tab === "webhooks" && <WebhooksTab search={search} />}
        </div>
      </div>
    </div>
  );
}
