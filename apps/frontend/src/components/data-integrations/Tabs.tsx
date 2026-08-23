"use client";

import { Plug, FileClock, KeyRound, Webhook as WebhookIcon } from "lucide-react";

export type TabKey = "connections" | "logs" | "keys" | "webhooks";

const TAB_CONFIG: { key: TabKey; label: string; icon: typeof Plug }[] = [
  { key: "connections", label: "Connections", icon: Plug },
  { key: "logs", label: "Sync Logs", icon: FileClock },
  { key: "keys", label: "API Keys", icon: KeyRound },
  { key: "webhooks", label: "Webhooks", icon: WebhookIcon },
];

export default function Tabs({
  active,
  onChange,
  badges,
}: {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  badges: Record<TabKey, number>;
}) {
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="flex flex-wrap gap-1 px-2 sm:px-4">
        {TAB_CONFIG.map(({ key, label, icon: Icon }) => {
          const isActive = active === key;
          const badge = badges[key];
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={`flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {badge > 0 && (
                <span
                  className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold ${
                    isActive ? "bg-red-500 text-white" : "bg-red-100 text-red-600"
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
