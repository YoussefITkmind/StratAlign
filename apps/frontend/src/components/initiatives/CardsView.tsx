"use client";

import Link from "next/link";
import { Calendar } from "lucide-react";
import {
  COLOR_TOKENS,
  PRIORITY_TOKENS,
  PRIORITY_DOT,
  STATUS_TOKENS,
  STATUS_DOT,
  type MockInitiative,
} from "@/data/mockInitiativesBoard";

export function CardsView({ initiatives }: { initiatives: MockInitiative[] }) {
  if (initiatives.length === 0) {
    return <EmptyState />;
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {initiatives.map((item) => (
        <InitiativeCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function InitiativeCard({ item }: { item: MockInitiative }) {
  const colors = COLOR_TOKENS[item.color];
  return (
    <Link
      href={`/initiatives-projects/${item.id}`}
      data-testid="board-initiative-card"
      className={`block overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:shadow-md`}
    >
      <div className={`h-1.5 w-full ${colors.bar}`} />
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${PRIORITY_TOKENS[item.priority]}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[item.priority]}`} />
            {item.priority}
          </span>
          <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TOKENS[item.status]}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[item.status]}`} />
            {item.status}
          </span>
        </div>

        <h3 className="mt-2.5 text-[15px] font-bold leading-snug text-slate-900">{item.name}</h3>
        <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-slate-500">{item.description}</p>

        <div className="mt-3.5 flex items-center justify-between text-[12px] text-slate-500">
          <span>Progress</span>
          <span className="font-semibold text-slate-700">{item.progress}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${item.progress}%` }} />
        </div>

        <div className="mt-3.5 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-slate-50 py-2">
            <div className="text-[13px] font-bold text-slate-800">
              {item.milestonesDone}/{item.milestonesTotal}
            </div>
            <div className="text-[10.5px] text-slate-400">Milestones</div>
          </div>
          <div className="rounded-lg bg-slate-50 py-2">
            <div className={`text-[13px] font-bold ${item.risks > 0 ? "text-red-600" : "text-slate-800"}`}>{item.risks}</div>
            <div className="text-[10.5px] text-slate-400">Risks</div>
          </div>
          <div className="rounded-lg bg-slate-50 py-2">
            <div className="text-[13px] font-bold text-slate-300 blur-[3px] select-none">$0.0M</div>
            <div className="text-[10.5px] text-slate-400">Budget</div>
          </div>
        </div>

        <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-3">
          <div className="flex -space-x-2">
            {item.team.map((member, i) => (
              <span
                key={`${member.initials}-${i}`}
                className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[9.5px] font-semibold text-white ${member.color}`}
              >
                {member.initials}
              </span>
            ))}
          </div>
          <span className="flex items-center gap-1 text-[11.5px] text-slate-400">
            <Calendar className="h-3 w-3" />
            {item.dueDate}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-[13px] text-slate-400">
      No initiatives match the current filters.
    </div>
  );
}
