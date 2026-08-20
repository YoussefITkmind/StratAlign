"use client";

import Link from "next/link";
import { Calendar } from "lucide-react";
import {
  COLOR_TOKENS,
  KANBAN_COLUMNS,
  PRIORITY_TOKENS,
  STATUS_DOT,
  type MockInitiative,
} from "@/data/mockInitiativesBoard";
import { EmptyState } from "@/components/initiatives/CardsView";

export function KanbanView({ initiatives }: { initiatives: MockInitiative[] }) {
  if (initiatives.length === 0) {
    return <EmptyState />;
  }
  return (
    <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 sm:snap-none">
      {KANBAN_COLUMNS.map((status) => {
        const items = initiatives.filter((item) => item.status === status);
        return (
          <div key={status} className="w-[84vw] shrink-0 snap-start sm:w-72 sm:snap-align-none">
            <div className="mb-2.5 flex items-center gap-2 px-1">
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
              <h3 className="text-[13px] font-semibold text-slate-700">{status}</h3>
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-500">
                {items.length}
              </span>
            </div>
            <div className="space-y-2.5">
              {items.map((item) => (
                <KanbanCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({ item }: { item: MockInitiative }) {
  const colors = COLOR_TOKENS[item.color];
  return (
    <Link
      href={`/initiatives-projects/${item.id}`}
      data-testid="board-initiative-card"
      className="block rounded-xl border border-slate-200 bg-white p-3 transition hover:shadow-md"
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${colors.dot}`} />
        <h4 className="text-[13px] font-semibold leading-snug text-slate-900">{item.name}</h4>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${PRIORITY_TOKENS[item.priority]}`}>{item.priority}</span>
        <span className="truncate text-[11px] text-slate-400">{item.department}</span>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
        <span>Progress</span>
        <span className="font-semibold text-slate-700">{item.progress}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${item.progress}%` }} />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex -space-x-2">
          {item.team.slice(0, 3).map((member, i) => (
            <span
              key={`${member.initials}-${i}`}
              className={`flex h-5 w-5 items-center justify-center rounded-full border-2 border-white text-[9px] font-semibold text-white ${member.color}`}
            >
              {member.initials}
            </span>
          ))}
        </div>
        <span className="flex items-center gap-1 text-[10.5px] text-slate-400">
          <Calendar className="h-3 w-3" />
          {item.dueDate}
        </span>
      </div>
    </Link>
  );
}
