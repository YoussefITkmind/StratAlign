"use client";

import type { AuditTrailEntry } from "@/types/governance";
import { colorForInitials } from "@/lib/governanceConfig";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const ACTION_STYLES: Record<AuditTrailEntry["actionType"], string> = {
  create: "bg-blue-50 text-blue-700",
  update: "bg-amber-50 text-amber-700",
  delete: "bg-red-50 text-red-700",
  approve: "bg-emerald-50 text-emerald-700",
  reject: "bg-gray-100 text-gray-600",
};

export default function AuditTrailTab({ entries }: { entries: AuditTrailEntry[] }) {
  const sorted = [...entries].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3">Actor</th>
            <th className="px-4 py-3">Action</th>
            <th className="px-4 py-3">Entity</th>
            <th className="px-4 py-3 text-right">Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-16 text-center text-sm text-gray-400">
                No activity recorded yet.
              </td>
            </tr>
          )}
          {sorted.map((entry) => (
            <tr key={entry.id} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${colorForInitials(
                      entry.actor.initials
                    )}`}
                  >
                    {entry.actor.initials}
                  </span>
                  <span className="font-medium text-gray-800">{entry.actor.name}</span>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${ACTION_STYLES[entry.actionType]}`}>
                  {entry.action}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-700">{entry.entity}</td>
              <td className="px-4 py-3 text-right text-gray-500">{formatTimestamp(entry.timestamp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
