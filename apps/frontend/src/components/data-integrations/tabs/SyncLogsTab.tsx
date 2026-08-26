"use client";

import { useMemo, useState } from "react";
import { Search, ChevronDown, Sparkles, Check } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import SyncInvestigationModal, {
  type SyncInvestigationResultView,
} from "@/components/data-integrations/SyncInvestigationModal";

const LOG_STATUS_META: Record<string, { label: string; text: string; dot: string }> = {
  SUCCESS: { label: "Success", text: "text-emerald-600", dot: "bg-emerald-500" },
  FAILED: { label: "Failed", text: "text-red-600", dot: "bg-red-500" },
  PARTIAL: { label: "Partial", text: "text-orange-600", dot: "bg-orange-500" },
  RUNNING: { label: "Running", text: "text-blue-600", dot: "bg-blue-500 animate-pulse" },
};
const UNKNOWN_LOG_STATUS_META = { label: "Unknown", text: "text-slate-500", dot: "bg-slate-400" };

export default function SyncLogsTab({ search }: { search: string }) {
  const query = trpc.integrations.syncLogs.list.useQuery();
  const logs = useMemo(() => query.data ?? [], [query.data]);

  const [integration, setIntegration] = useState("All Integrations");
  const [intOpen, setIntOpen] = useState(false);
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState<string[]>([]);
  const [investigating, setInvestigating] = useState<{ id: string; integration: string } | null>(null);
  const [result, setResult] = useState<SyncInvestigationResultView | null>(null);
  const [investigationError, setInvestigationError] = useState<string | null>(null);

  const investigation = trpc.integrations.syncLogs.investigate.useMutation();

  const integrations = useMemo(
    () => ["All Integrations", ...Array.from(new Set(logs.map((l) => l.integration)))],
    [logs]
  );
  const filters = ["All", ...Object.values(LOG_STATUS_META).map((m) => m.label)];

  const filtered = logs.filter((l) => {
    const matchesSearch =
      l.integration.toLowerCase().includes(search.toLowerCase()) ||
      l.message.toLowerCase().includes(search.toLowerCase());
    const matchesIntegration = integration === "All Integrations" || l.integration === integration;
    const matchesFilter = filter === "All" || LOG_STATUS_META[l.status]?.label === filter;
    return matchesSearch && matchesIntegration && matchesFilter;
  });

  const counts = {
    Success: logs.filter((l) => l.status === "SUCCESS").length,
    Failed: logs.filter((l) => l.status === "FAILED").length,
    Partial: logs.filter((l) => l.status === "PARTIAL").length,
    Running: logs.filter((l) => l.status === "RUNNING").length,
  };
  const recordsIn = logs.reduce((a, l) => a + (l.recordsIn ?? 0), 0);
  const recordsOut = logs.reduce((a, l) => a + (l.recordsOut ?? 0), 0);
  const failedCount = counts.Failed;

  function toggleAll() {
    setSelected((prev) => (prev.length === filtered.length ? [] : filtered.map((l) => l.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function runInvestigation(log: { id: string; integration: string }) {
    if (investigation.isPending) return;
    setInvestigating({ id: log.id, integration: log.integration });
    setResult(null);
    setInvestigationError(null);
    try {
      const diagnosis = await investigation.mutateAsync({ syncLogId: log.id });
      setResult(diagnosis);
    } catch (error) {
      setInvestigationError(
        error instanceof Error && error.message
          ? error.message
          : "Unable to investigate this sync run. Try again.",
      );
    }
  }

  function closeInvestigation() {
    setInvestigating(null);
    setResult(null);
    setInvestigationError(null);
  }

  const firstFailed = logs.find((l) => l.status === "FAILED");

  return (
    <div>
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
        <Stat label="SUCCESSFUL" value={counts.Success} color="text-emerald-600" />
        <Stat label="FAILED" value={counts.Failed} color="text-red-600" />
        <Stat label="PARTIAL" value={counts.Partial} color="text-orange-600" />
        <Stat label="RUNNING" value={counts.Running} color="text-blue-600" />
        <Stat label="RECORDS IN" value={`${Math.round(recordsIn / 1000)}K`} color="text-slate-700" />
        <Stat label="RECORDS OUT" value={`${Math.round(recordsOut / 1000)}K`} color="text-slate-700" />
      </div>

      {failedCount > 0 && firstFailed && (
        <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-white"><Sparkles className="h-4 w-4" /></span>
            <div>
              <div className="flex items-center gap-2"><p className="text-sm font-semibold text-slate-900">AI Sync Investigator</p><span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">AI-assisted</span></div>
              <p className="mt-0.5 text-xs text-slate-500">{failedCount} failed {failedCount === 1 ? "sync" : "syncs"} detected — AI can analyse the recorded logs to suggest a likely cause and next steps.</p>
            </div>
          </div>
          <button onClick={() => runInvestigation(firstFailed)} disabled={investigation.isPending} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"><Sparkles className="h-3.5 w-3.5" />Investigate latest failure</button>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input readOnly value={search} placeholder="Search logs..." className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" /></div>
        <div className="relative">
          <button onClick={() => setIntOpen(!intOpen)} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">{integration}<ChevronDown className="h-3.5 w-3.5 text-slate-400" /></button>
          {intOpen && <div className="absolute left-0 z-30 mt-1.5 w-56 animate-fade-in rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">{integrations.map((o) => <button key={o} onClick={() => { setIntegration(o); setIntOpen(false); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">{o}{o === integration && <Check className="h-3.5 w-3.5 text-blue-600" />}</button>)}</div>}
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">{filters.map((f) => <button key={f} onClick={() => setFilter(f)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${filter === f ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"}`}>{f}</button>)}</div>
        <span className="ml-auto text-sm text-slate-400">{filtered.length} logs</span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead><tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400"><th className="w-10 px-4 py-3"><input type="checkbox" checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleAll} className="h-3.5 w-3.5 rounded border-slate-300" /></th><th className="px-2 py-3 font-medium">Integration</th><th className="px-2 py-3 font-medium">Started</th><th className="px-2 py-3 font-medium">Duration</th><th className="px-2 py-3 font-medium">Status</th><th className="px-2 py-3 font-medium">Records In</th><th className="px-2 py-3 font-medium">Records Out</th><th className="px-2 py-3 font-medium">Errors</th><th className="px-4 py-3 font-medium">Message</th><th className="px-4 py-3 text-right font-medium">Investigate</th></tr></thead>
          <tbody>
            {filtered.map((l) => {
              const meta = LOG_STATUS_META[l.status] ?? UNKNOWN_LOG_STATUS_META;
              return (
                <tr key={l.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3"><input type="checkbox" checked={selected.includes(l.id)} onChange={() => toggleOne(l.id)} className="h-3.5 w-3.5 rounded border-slate-300" /></td>
                  <td className="px-2 py-3"><div className="flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-semibold text-white ${l.color}`}>{l.icon}</span><span className="font-medium text-slate-800">{l.integration}</span></div></td>
                  <td className="px-2 py-3 whitespace-nowrap text-slate-500">{l.started}</td><td className="px-2 py-3 whitespace-nowrap text-slate-500">{l.duration}</td>
                  <td className="px-2 py-3"><span className={`flex items-center gap-1.5 font-medium ${meta.text}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span></td>
                  <td className="px-2 py-3 text-slate-600">{l.recordsIn ?? "—"}</td><td className="px-2 py-3 text-slate-600">{l.recordsOut ?? "—"}</td>
                  <td className="px-2 py-3">{l.errors ? <span className="text-orange-600 font-medium">{l.errors}</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3 max-w-xs text-slate-500">{l.message}</td>
                  <td className="px-4 py-3 text-right"><button onClick={() => runInvestigation(l)} disabled={investigation.isPending} aria-label={`Investigate ${l.integration} sync run`} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" />{investigation.isPending && investigating?.id === l.id ? "Investigating…" : "Investigate"}</button></td>
                </tr>
              );
            })}
            {!query.isLoading && filtered.length === 0 && <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-400">No logs match your filters.</td></tr>}
          </tbody>
        </table>
      </div>

      {investigating && <SyncInvestigationModal integration={investigating.integration} isLoading={investigation.isPending} error={investigationError} result={result} onClose={closeInvestigation} />}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center"><p className={`text-2xl font-bold ${color}`}>{value}</p><p className="mt-0.5 text-[10px] font-medium tracking-wide text-slate-400">{label}</p></div>;
}
