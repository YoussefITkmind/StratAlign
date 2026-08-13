"use client";

export interface RealDecisionLogEntry {
  id: string;
  caseId: string;
  entityType: string;
  entityId: string;
  decision: "approved" | "rejected" | "changes_requested";
  decidedBy: string;
  decidedAt: string;
  rationale: string | null;
}

const DECISION_TOKENS: Record<RealDecisionLogEntry["decision"], { label: string; bg: string; text: string }> = {
  approved: { label: "Approved", bg: "bg-emerald-50", text: "text-emerald-700" },
  rejected: { label: "Rejected", bg: "bg-red-50", text: "text-red-700" },
  changes_requested: { label: "Changes Requested", bg: "bg-blue-50", text: "text-blue-700" },
};

export default function DecisionLogTab({ entries }: { entries: RealDecisionLogEntry[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Recent Decisions
      </div>

      {entries.length === 0 && (
        <div className="px-4 py-16 text-center text-sm text-gray-400">No decisions recorded yet.</div>
      )}

      {entries.map((entry) => {
        const token = DECISION_TOKENS[entry.decision];
        return (
          <div key={entry.id} data-testid="decision-log-entry" className="border-b border-gray-100 px-4 py-4 last:border-b-0 hover:bg-gray-50">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">{entry.entityType}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${token.bg} ${token.text}`}>{token.label}</span>
              <span className="text-xs text-gray-400">{new Date(entry.decidedAt).toLocaleString()}</span>
            </div>
            <p className="mt-1.5 text-[15px] font-semibold text-gray-900">{entry.entityId}</p>
            <p className="mt-2 text-sm text-gray-600">
              Decided by <span className="font-mono">{entry.decidedBy}</span>
              {entry.rationale ? <> — &quot;{entry.rationale}&quot;</> : null}
            </p>
          </div>
        );
      })}
    </div>
  );
}
