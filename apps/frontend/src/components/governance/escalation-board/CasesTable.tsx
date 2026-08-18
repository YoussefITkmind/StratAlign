import { Check, Eye } from "lucide-react";
import { EscalationCase } from "@/types/case";
import { PriorityBadge, StatusBadge, SLABadge } from "./Badges";

interface CasesTableProps {
  cases: EscalationCase[];
  onView?: (id: string) => void;
  onAcknowledge?: (id: string) => void;
}

export default function CasesTable({ cases, onView, onAcknowledge }: CasesTableProps) {
  if (cases.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-8 text-center text-gray-400">
        No cases match your filters.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      {/* Below md: a stacked card per case — a table forced into that width just
          scrolls horizontally, which hides columns rather than adapting. */}
      <div className="divide-y divide-gray-100 md:hidden">
        {cases.map((c) => (
          <div key={c.id} className="p-4">
            <div className="mb-2.5 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-gray-900">{c.title}</div>
                <span className="mt-1 inline-block rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">
                  {c.tag}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={`View ${c.title}`}
                  onClick={() => onView?.(c.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Acknowledge ${c.title}`}
                  onClick={() => onAcknowledge?.(c.id)}
                  disabled={c.status !== "Open"}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
              <PriorityBadge priority={c.priority} />
              <StatusBadge status={c.status} />
              <SLABadge zone={c.slaZone} label={c.slaLabel} />
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-700">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${c.owner.color}`}>
                {c.owner.initials}
              </span>
              {c.owner.name}
            </div>
          </div>
        ))}
      </div>

      {/* md and up: the full table. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="min-w-[260px] whitespace-nowrap border-b border-gray-100 px-5 py-3 text-start text-[11px] font-semibold tracking-wide text-gray-400">
                TITLE &amp; TYPE
              </th>
              <th className="whitespace-nowrap border-b border-gray-100 px-5 py-3 text-start text-[11px] font-semibold tracking-wide text-gray-400">
                PRIORITY
              </th>
              <th className="whitespace-nowrap border-b border-gray-100 px-5 py-3 text-start text-[11px] font-semibold tracking-wide text-gray-400">
                OWNER
              </th>
              <th className="whitespace-nowrap border-b border-gray-100 px-5 py-3 text-start text-[11px] font-semibold tracking-wide text-gray-400">
                STATUS
              </th>
              <th className="whitespace-nowrap border-b border-gray-100 px-5 py-3 text-start text-[11px] font-semibold tracking-wide text-gray-400">
                SLA
              </th>
              <th className="whitespace-nowrap border-b border-gray-100 px-5 py-3 text-end text-[11px] font-semibold tracking-wide text-gray-400">
                ACTIONS
              </th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id}>
                <td className="border-b border-gray-100 px-5 py-4">
                  <div className="mb-1 font-semibold text-gray-900">{c.title}</div>
                  <span className="inline-block rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">
                    {c.tag}
                  </span>
                </td>
                <td className="border-b border-gray-100 px-5 py-4">
                  <PriorityBadge priority={c.priority} />
                </td>
                <td className="border-b border-gray-100 px-5 py-4">
                  <div className="flex items-center gap-2 whitespace-nowrap text-gray-700">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${c.owner.color}`}>
                      {c.owner.initials}
                    </span>
                    {c.owner.name}
                  </div>
                </td>
                <td className="border-b border-gray-100 px-5 py-4">
                  <StatusBadge status={c.status} />
                </td>
                <td className="border-b border-gray-100 px-5 py-4">
                  <SLABadge zone={c.slaZone} label={c.slaLabel} />
                </td>
                <td className="border-b border-gray-100 px-5 py-4">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      aria-label={`View ${c.title}`}
                      onClick={() => onView?.(c.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Acknowledge ${c.title}`}
                      onClick={() => onAcknowledge?.(c.id)}
                      disabled={c.status !== "Open"}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
