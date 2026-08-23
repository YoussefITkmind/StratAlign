"use client";

import { Search, Database, Link2, AlertTriangle, Webhook } from "lucide-react";

export default function PageHeader({
  connectedCount,
  totalCount,
  errorCount,
  recordsToday,
  activeWebhooks,
  search,
  onSearch,
}: {
  connectedCount: number;
  totalCount: number;
  errorCount: number;
  recordsToday: string;
  activeWebhooks: number;
  search: string;
  onSearch: (value: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.3rem] font-bold tracking-tight text-slate-900">
            Data &amp; Integrations
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Connections · Sync · API · Webhooks
          </p>
        </div>
        <div className="relative w-full max-w-xs sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search connections, logs, keys, webhooks..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={Link2}
          iconColor="text-emerald-600 bg-emerald-50"
          label="Connected"
          value={`${connectedCount}/${totalCount}`}
        />
        <StatCard
          icon={AlertTriangle}
          iconColor="text-red-600 bg-red-50"
          label="Errors"
          value={String(errorCount)}
        />
        <StatCard
          icon={Database}
          iconColor="text-blue-600 bg-blue-50"
          label="Records today"
          value={recordsToday}
        />
        <StatCard
          icon={Webhook}
          iconColor="text-violet-600 bg-violet-50"
          label="Active webhooks"
          value={String(activeWebhooks)}
        />
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  iconColor,
  label,
  value,
}: {
  icon: typeof Database;
  iconColor: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconColor}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-lg font-bold text-slate-900">{value}</p>
        <p className="truncate text-[11px] font-medium text-slate-500">{label}</p>
      </div>
    </div>
  );
}
