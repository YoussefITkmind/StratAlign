"use client";

import type { DecisionLogEntry } from "@/types/governance";
import { APPROVAL_CATEGORY_CONFIG, colorForInitials, formatDate } from "@/lib/governanceConfig";

export default function DecisionLogTab({ entries }: { entries: DecisionLogEntry[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Recent Decisions
      </div>

      {entries.length === 0 && (
        <div className="px-4 py-16 text-center text-sm text-gray-400">No decisions recorded yet.</div>
      )}

      {entries.map((entry) => {
        const category = APPROVAL_CATEGORY_CONFIG[entry.category];
        const isApproved = entry.outcome === "approved";
        return (
          <div key={entry.id} className="border-b border-gray-100 px-4 py-4 last:border-b-0 hover:bg-gray-50">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${category.bg} ${category.text}`}>
                {category.label}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  isApproved ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                }`}
              >
                {isApproved ? "Approved" : "Rejected"}
              </span>
              <span className="text-xs font-medium text-gray-500">{entry.committee}</span>
              <span className="text-xs text-gray-400">{formatDate(entry.decidedDate)}</span>
            </div>
            <p className="mt-1.5 text-[15px] font-semibold text-gray-900">{entry.title}</p>
            <div className="mt-2 flex items-start gap-2 text-sm text-gray-600">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${colorForInitials(
                  entry.decidedBy.initials
                )}`}
              >
                {entry.decidedBy.initials}
              </span>
              <p>
                <span className="font-medium text-gray-800">{entry.decidedBy.name}</span> — {entry.rationale}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
