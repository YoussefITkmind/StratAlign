"use client";

import { useState } from "react";
import { AlertCircle, Bot, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import InvestigationPanel from "./InvestigationPanel";
import { message, STATUS_BADGE_CLASS, STATUS_LABEL, type SyncRunStatus } from "./sync-log-status";

/**
 * Minimal Sync Logs page: a real table backed by `syncLog.list`, with an
 * "Investigate" action per entry that opens the dedicated AI investigation
 * panel. Everything else Data & Integrations will eventually need
 * (connection management, schedules, credentials) is out of scope — this
 * page exists only to give Task 5 a real surface to trigger from.
 */
export default function SyncLogsPage() {
  const [statusFilter, setStatusFilter] = useState<SyncRunStatus | "all">("all");
  const [investigatingRunId, setInvestigatingRunId] = useState<string | null>(null);

  const runs = trpc.syncLog.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 100,
  });

  return (
    <div>
      <h1 className="text-[1.4rem] font-bold tracking-tight text-slate-900">Sync Logs</h1>
      <p className="mt-1 text-[14px] text-slate-500">
        Review recent data sync attempts and ask AI to explain a failure or an unusual volume drop.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="flex items-center overflow-hidden rounded-full border border-slate-200">
          {(["all", "success", "failed", "partial", "running"] as const).map((key) => (
            <button
              key={key}
              type="button"
              data-testid={`filter-${key}`}
              onClick={() => setStatusFilter(key)}
              className={`border-l border-slate-200 px-3.5 py-1.5 text-xs font-medium first:border-l-0 ${
                statusFilter === key
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {key === "all" ? "All" : STATUS_LABEL[key]}
            </button>
          ))}
        </div>
        {runs.isError && (
          <button
            type="button"
            data-testid="retry-list"
            onClick={() => void runs.refetch()}
            className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        )}
      </div>

      {runs.isError && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> Couldn&apos;t load sync logs: {message(runs.error)}
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-start text-[13px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2.5 text-start font-medium">Source</th>
              <th className="px-4 py-2.5 text-start font-medium">Status</th>
              <th className="px-4 py-2.5 text-start font-medium">Started</th>
              <th className="px-4 py-2.5 text-start font-medium">Volume</th>
              <th className="px-4 py-2.5 text-start font-medium">Error</th>
              <th className="px-4 py-2.5 text-start font-medium">Investigation</th>
            </tr>
          </thead>
          <tbody data-testid="sync-log-rows">
            {runs.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Loading sync logs…
                </td>
              </tr>
            )}
            {runs.data?.map((run) => (
              <tr key={run.id} className="border-t border-slate-100">
                <td className="px-4 py-2.5 font-medium text-slate-900">{run.sourceName}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE_CLASS[run.status]}`}
                  >
                    {STATUS_LABEL[run.status]}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-slate-500">
                  {new Date(run.startedAt).toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-slate-500">{run.recordsProcessed ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-500">
                  {run.errorCode ?? (run.status === "failed" || run.status === "partial" ? "—" : "")}
                </td>
                <td className="px-4 py-2.5">
                  <button
                    type="button"
                    data-testid={`investigate-${run.id}`}
                    onClick={() => setInvestigatingRunId(run.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                  >
                    <Bot className="h-3.5 w-3.5" /> Investigate
                  </button>
                </td>
              </tr>
            ))}
            {!runs.isLoading && runs.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No sync runs recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {investigatingRunId && (
        <InvestigationPanel
          // Remounts on a different run so the auto-investigate effect fires
          // again — switching targets is a fresh investigation, not a resume.
          key={investigatingRunId}
          syncRunId={investigatingRunId}
          onClose={() => setInvestigatingRunId(null)}
        />
      )}
    </div>
  );
}
