"use client";

import { Users } from "lucide-react";
import type { Committee } from "@/types/governance";
import { colorForInitials, formatDate } from "@/lib/governanceConfig";

export default function CommitteesTab({ committees }: { committees: Committee[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {committees.map((committee) => (
        <div key={committee.id} className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                <Users className="h-4 w-4 text-slate-600" />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{committee.code}</p>
                <p className="text-[15px] font-semibold text-gray-900">{committee.name}</p>
              </div>
            </div>
            {committee.needsAttention && (
              <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700">
                Needs attention
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${colorForInitials(
                committee.chair.initials
              )}`}
            >
              {committee.chair.initials}
            </span>
            <span>
              Chaired by <span className="font-medium text-gray-800">{committee.chair.name}</span>
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3 text-center">
            <div>
              <p className="text-lg font-semibold text-gray-900">{committee.memberCount}</p>
              <p className="text-[11px] text-gray-400">Members</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900">{committee.pendingItems}</p>
              <p className="text-[11px] text-gray-400">Pending</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{formatDate(committee.nextMeeting)}</p>
              <p className="text-[11px] text-gray-400">Next Meeting</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
