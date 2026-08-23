"use client";

import { useState } from "react";
import PageHeader from "@/components/data-integrations/PageHeader";
import Tabs, { TabKey } from "@/components/data-integrations/Tabs";
import ConnectionsTab from "@/components/data-integrations/tabs/ConnectionsTab";
import SyncLogsTab from "@/components/data-integrations/tabs/SyncLogsTab";
import ApiKeysTab from "@/components/data-integrations/tabs/ApiKeysTab";
import WebhooksTab from "@/components/data-integrations/tabs/WebhooksTab";
import {
  connections as initialConnections,
  syncLogs as initialLogs,
  apiKeys as initialKeys,
  webhooks as initialWebhooks,
} from "@/data/mockDataIntegrations";

export default function DataIntegrationsPage() {
  const [tab, setTab] = useState<TabKey>("connections");
  const [search, setSearch] = useState("");
  const [connections, setConnections] = useState(initialConnections);
  const [logs] = useState(initialLogs);
  const [apiKeys, setApiKeys] = useState(initialKeys);
  const [webhooks, setWebhooks] = useState(initialWebhooks);

  const connectedCount = connections.filter((c) => c.status === "Connected").length;
  const errorCount = connections.filter((c) => c.status === "Error").length;
  const activeWebhooks = webhooks.filter((w) => w.active).length;

  const badges: Record<TabKey, number> = {
    connections: connections.filter((c) => c.status === "Error").length,
    logs: logs.filter((l) => l.status === "Failed").length,
    keys: 0,
    webhooks: webhooks.filter((w) => w.successRate < 90).length,
  };

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
      <PageHeader
        connectedCount={connectedCount}
        totalCount={connections.length}
        errorCount={errorCount}
        recordsToday="406K"
        activeWebhooks={activeWebhooks}
        search={search}
        onSearch={setSearch}
      />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <Tabs active={tab} onChange={setTab} badges={badges} />
        <div className="p-5">
          {tab === "connections" && (
            <ConnectionsTab
              connections={connections}
              setConnections={setConnections}
              search={search}
            />
          )}
          {tab === "logs" && <SyncLogsTab logs={logs} search={search} />}
          {tab === "keys" && (
            <ApiKeysTab apiKeys={apiKeys} setApiKeys={setApiKeys} search={search} />
          )}
          {tab === "webhooks" && (
            <WebhooksTab webhooks={webhooks} setWebhooks={setWebhooks} search={search} />
          )}
        </div>
      </div>
    </div>
  );
}
