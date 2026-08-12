"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { ApprovalCase, ApprovalStatus } from "@/types/governance";
import ApprovalCard from "../ApprovalCard";

type FilterKey = "all" | "pending" | "escalated" | "approved" | "rejected";

const FILTERS: { key: FilterKey; label: string; status?: ApprovalStatus }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending", status: "pending" },
  { key: "escalated", label: "Escalated", status: "escalated" },
  { key: "approved", label: "Approved", status: "approved" },
  { key: "rejected", label: "Rejected", status: "rejected" },
];

export default function ApprovalsTab({
  approvals,
  onApprove,
  onReject,
  onEscalate,
}: {
  approvals: ApprovalCase[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onEscalate: (id: string) => void;
}) {
  const [filter, setFilter] = useState<FilterKey>("pending");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: approvals.length, pending: 0, escalated: 0, approved: 0, rejected: 0 };
    for (const a of approvals) c[a.status] += 1;
    return c;
  }, [approvals]);

  const visible = useMemo(() => {
    const activeFilter = FILTERS.find((f) => f.key === filter);
    return approvals.filter((a) => {
      if (activeFilter?.status && a.status !== activeFilter.status) return false;
      if (search.trim() && !a.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [approvals, filter, search]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search approvals..."
              className="w-64 rounded-full border border-gray-300 py-2 pl-9 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center gap-1">
            {FILTERS.map((f) => {
              const isActive = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  data-testid={`approval-filter-${f.key}`}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    isActive ? "bg-slate-900 text-white" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  }`}
                >
                  {f.label}
                  {counts[f.key] > 0 && (
                    <span
                      className={`rounded-full px-1.5 text-xs ${
                        isActive ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {counts[f.key]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{visible.length} items</span>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" /> New Approval
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {visible.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">
            No approvals match your filters.
          </div>
        )}
        {visible.map((approval) => (
          <ApprovalCard
            key={approval.id}
            approval={approval}
            onApprove={onApprove}
            onReject={onReject}
            onEscalate={onEscalate}
          />
        ))}
      </div>
    </div>
  );
}
