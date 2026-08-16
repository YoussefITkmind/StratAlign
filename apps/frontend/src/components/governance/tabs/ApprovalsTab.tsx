"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import ApprovalCard, { type ApprovalDecision, type RealApprovalCase } from "../ApprovalCard";

export default function ApprovalsTab({
  approvals,
  onDecide,
  decidingId,
  error,
}: {
  approvals: RealApprovalCase[];
  onDecide: (id: string, decision: ApprovalDecision, reason: string) => void;
  decidingId: string | null;
  error?: string | null;
}) {
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return approvals;
    return approvals.filter((a) => a.entityType.toLowerCase().includes(term) || a.entityId.toLowerCase().includes(term));
  }, [approvals, search]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by entity type or id..."
            className="w-full rounded-full border border-gray-300 py-2 pl-9 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <span className="text-sm text-gray-500" data-testid="approvals-count">{visible.length} pending</span>
      </div>

      <div data-testid="approvals-list" className="flex flex-col gap-3">
        {visible.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">
            No approvals assigned to you right now.
          </div>
        )}
        {visible.map((approval) => (
          <ApprovalCard
            key={approval.id}
            approval={approval}
            onDecide={onDecide}
            deciding={decidingId === approval.id}
            error={decidingId === approval.id ? error : null}
          />
        ))}
      </div>
    </div>
  );
}
