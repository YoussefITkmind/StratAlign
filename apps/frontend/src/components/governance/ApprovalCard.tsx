"use client";

import { useState } from "react";
import { Check, ChevronDown, MessageSquare, X } from "lucide-react";
import type { ApprovalCase } from "@/types/governance";
import {
  APPROVAL_CATEGORY_CONFIG,
  APPROVAL_PRIORITY_CONFIG,
  APPROVAL_STATUS_CONFIG,
  colorForInitials,
  formatDate,
} from "@/lib/governanceConfig";

export default function ApprovalCard({
  approval,
  onApprove,
  onReject,
  onEscalate,
}: {
  approval: ApprovalCase;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onEscalate: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const category = APPROVAL_CATEGORY_CONFIG[approval.category];
  const status = APPROVAL_STATUS_CONFIG[approval.status];
  const priority = APPROVAL_PRIORITY_CONFIG[approval.priority];
  const actionable = approval.status === "pending" || approval.status === "escalated";

  const accentBar = !actionable
    ? approval.status === "approved"
      ? "bg-emerald-400"
      : "bg-gray-200"
    : approval.priority === "urgent"
    ? "bg-red-500"
    : "bg-amber-400";

  return (
    <div
      className="flex overflow-hidden rounded-2xl border border-gray-200 bg-white transition hover:border-gray-300"
      data-testid="approval-card"
      data-status={approval.status}
    >
      <div className="min-w-0 flex-1 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${category.bg} ${category.text}`}>
            {category.label}
          </span>
          <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${status.bg} ${status.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
          {priority && (
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${priority.bg} ${priority.text}`}>
              {priority.label}
            </span>
          )}
          <span className="text-xs font-medium text-gray-500">{approval.committee}</span>
          <span className="text-xs text-gray-400">Due {formatDate(approval.dueDate)}</span>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 block text-left text-[15px] font-semibold text-gray-900 hover:underline"
        >
          {approval.title}
        </button>

        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${colorForInitials(
              approval.submittedBy.initials
            )}`}
          >
            {approval.submittedBy.initials}
          </span>
          <span className="font-medium text-gray-700">{approval.submittedBy.name}</span>
          <span>· {formatDate(approval.submittedDate)}</span>
          {approval.commentsCount > 0 && (
            <span className="flex items-center gap-1">
              · <MessageSquare className="h-3 w-3" />
              {approval.commentsCount} comment{approval.commentsCount === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {expanded && (
          <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            <p>{approval.description}</p>
            {approval.decidedBy && (
              <p className="mt-2 text-xs text-gray-500">
                {status.label} by <span className="font-medium text-gray-700">{approval.decidedBy.name}</span>
                {approval.decidedDate ? ` · ${formatDate(approval.decidedDate)}` : ""}
                {approval.decisionReason ? ` — "${approval.decisionReason}"` : ""}
              </p>
            )}
          </div>
        )}
      </div>

      <div className={`w-1 shrink-0 ${accentBar}`} aria-hidden="true" />

      <div className="flex shrink-0 items-center gap-2 p-4">
        {actionable ? (
          <>
            <button
              type="button"
              onClick={() => onApprove(approval.id)}
              data-testid="approve-approval"
              className="flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-sm font-medium text-emerald-600 hover:bg-emerald-50"
            >
              <Check className="h-3.5 w-3.5" /> Approve
            </button>
            <button
              type="button"
              onClick={() => onReject(approval.id)}
              data-testid="reject-approval"
              className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <X className="h-3.5 w-3.5" /> Reject
            </button>
            <button
              type="button"
              onClick={() => onEscalate(approval.id)}
              data-testid="escalate-approval"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Escalate
            </button>
          </>
        ) : (
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.bg} ${status.text}`}>
            {status.label}
          </span>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Collapse details" : "Expand details"}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>
    </div>
  );
}
