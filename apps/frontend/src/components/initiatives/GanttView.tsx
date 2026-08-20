"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import {
  COLOR_TOKENS,
  GANTT_MONTHS,
  PRIORITY_TOKENS,
  STATUS_TOKENS,
  type MockInitiative,
} from "@/data/mockInitiativesBoard";
import { EmptyState } from "@/components/initiatives/CardsView";

const PANEL_TABS = ["Overview", "Milestones", "Risks", "Dependencies", "Budget"] as const;
const MONTH_COUNT = GANTT_MONTHS.length;

export function GanttView({ initiatives }: { initiatives: MockInitiative[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(initiatives[0]?.id ?? null);
  const selected = initiatives.find((item) => item.id === selectedId) ?? null;

  if (initiatives.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex items-start gap-4">
      {/* min-w-0 lets this column actually shrink when the detail panel takes
          its place in the flex row, instead of the row overflowing and the
          browser adding a horizontal scrollbar. Every bar below is
          positioned with percentages, so it compresses along with it. */}
      <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-[10.5px] font-medium uppercase tracking-wide text-slate-400 sm:px-4">
          <div className="w-32 shrink-0 sm:w-52">Initiative</div>
          <div className="hidden flex-1 items-center md:flex">
            {GANTT_MONTHS.map((m) => (
              <span key={m} className="flex-1 text-center">{m}</span>
            ))}
          </div>
          <div className="w-9 shrink-0 text-end">%</div>
        </div>

        <div>
          {initiatives.map((item) => {
            const colors = COLOR_TOKENS[item.color];
            const leftPct = (item.startMonth / MONTH_COUNT) * 100;
            const widthPct = ((item.endMonth - item.startMonth + 1) / MONTH_COUNT) * 100;
            const isSelected = item.id === selectedId;
            return (
              <div
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                data-testid="gantt-row"
                className={`flex cursor-pointer items-center gap-3 border-b border-slate-50 px-3 py-3 last:border-0 hover:bg-slate-50 sm:px-4 ${
                  isSelected ? "bg-slate-50" : ""
                }`}
              >
                <div className="flex w-32 shrink-0 items-center gap-2 sm:w-52">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold text-white ${
                      item.team[0]?.color ?? "bg-slate-400"
                    }`}
                  >
                    {item.ownerInitials}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-semibold text-slate-800">{item.name}</div>
                    <div className="truncate text-[10.5px] text-slate-400">
                      <span className="md:hidden">
                        {GANTT_MONTHS[item.startMonth]}–{GANTT_MONTHS[item.endMonth]}
                      </span>
                      <span className="hidden md:inline">{item.status}</span>
                    </div>
                  </div>
                </div>

                <div className="relative h-6 min-w-0 flex-1">
                  <div className="pointer-events-none absolute inset-0 hidden md:block">
                    {Array.from({ length: MONTH_COUNT - 1 }, (_, i) => (
                      <span
                        key={i}
                        className="absolute top-0 h-full w-px bg-slate-100"
                        style={{ left: `${((i + 1) / MONTH_COUNT) * 100}%` }}
                      />
                    ))}
                  </div>
                  <div
                    className={`absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full ${colors.bar} ${
                      isSelected ? "ring-2 ring-offset-1 ring-slate-300" : ""
                    }`}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  >
                    <span className="absolute left-1/3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full border border-white/80 bg-white/90" />
                    <span className="absolute left-2/3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full border border-white/80 bg-white/90" />
                  </div>
                </div>

                <div className="w-9 shrink-0 text-end text-[12px] font-semibold text-slate-600">{item.progress}%</div>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="sticky top-4 hidden w-[340px] shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white lg:block">
          <GanttPanelBody item={selected} onClose={() => setSelectedId(null)} />
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setSelectedId(null)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white shadow-xl">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200" />
            <GanttPanelBody item={selected} onClose={() => setSelectedId(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

function GanttPanelBody({ item, onClose }: { item: MockInitiative; onClose: () => void }): ReactNode {
  const [tab, setTab] = useState<(typeof PANEL_TABS)[number]>("Overview");
  const colors = COLOR_TOKENS[item.color];

  return (
    <>
      <div className={`h-1 w-full ${colors.bar}`} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PRIORITY_TOKENS[item.priority]}`}>{item.priority}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TOKENS[item.status]}`}>{item.status}</span>
          </div>
          <button onClick={onClose} aria-label="Close panel" className="shrink-0 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <h3 className="mt-2.5 text-[15px] font-bold text-slate-900">{item.name}</h3>
        <p className="text-[12px] text-slate-400">
          {item.department} · {item.startDateLabel} → {item.endDateLabel}
        </p>

        <div className="mt-3.5 flex items-center justify-between text-[12px] text-slate-500">
          <span>Overall Progress</span>
          <span className="font-semibold text-slate-700">{item.progress}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${item.progress}%` }} />
        </div>

        <div className="mt-4 flex gap-4 overflow-x-auto border-b border-slate-100 text-[12px] font-medium text-slate-400">
          {PANEL_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px shrink-0 border-b-2 pb-2 ${tab === t ? "border-blue-600 text-blue-600" : "border-transparent hover:text-slate-600"}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-3.5 text-[12.5px]">
          {tab === "Overview" && (
            <div className="space-y-3">
              <p className="leading-relaxed text-slate-600">{item.description}</p>
              <dl className="grid grid-cols-2 gap-y-2 text-[12.5px]">
                <dt className="text-slate-400">Owner</dt>
                <dd className="text-end font-medium text-slate-700">{item.owner}</dd>
                <dt className="text-slate-400">Department</dt>
                <dd className="text-end font-medium text-slate-700">{item.department}</dd>
                <dt className="text-slate-400">Start Date</dt>
                <dd className="text-end font-medium text-slate-700">{item.startDateLabel}</dd>
                <dt className="text-slate-400">End Date</dt>
                <dd className="text-end font-medium text-slate-700">{item.endDateLabel}</dd>
                <dt className="text-slate-400">Team Size</dt>
                <dd className="text-end font-medium text-slate-700">{item.teamSize} members</dd>
                <dt className="text-slate-400">Milestones</dt>
                <dd className="text-end font-medium text-slate-700">
                  {item.milestonesDone}/{item.milestonesTotal} complete
                </dd>
              </dl>
              <Link
                href={`/initiatives-projects/${item.id}`}
                className="mt-2 block rounded-xl bg-blue-600 px-3 py-2 text-center text-[12.5px] font-semibold text-white hover:bg-blue-700"
              >
                Open initiative
              </Link>
            </div>
          )}
          {tab === "Milestones" && (
            <p className="text-slate-400">
              {item.milestonesDone}/{item.milestonesTotal} milestones complete. Open the initiative for the full list.
            </p>
          )}
          {tab === "Risks" && (
            <p className="text-slate-400">{item.risks > 0 ? `${item.risks} open risk${item.risks > 1 ? "s" : ""} flagged.` : "No risks flagged."}</p>
          )}
          {tab === "Dependencies" && <p className="text-slate-400">No dependencies recorded.</p>}
          {tab === "Budget" && <p className="text-slate-400 blur-[3px] select-none">$0.0M allocated · $0.0M spent</p>}
        </div>
      </div>
    </>
  );
}
