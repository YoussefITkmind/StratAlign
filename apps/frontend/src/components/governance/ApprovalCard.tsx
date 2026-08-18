"use client";

import { useState } from "react";
import { Check, ChevronDown, CirclePause, MessageSquareWarning, OctagonX, X } from "lucide-react";
import { renderDiffFor } from "./diff/registry";

export type ApprovalDecision =
  | "approved"
  | "rejected"
  | "changes_requested"
  | "continue"
  | "intervene"
  | "stop";

export interface RealApprovalCase {
  id: string;
  caseType: string;
  entityType: string;
  entityId: string;
  status: "draft" | "pending" | "approved" | "rejected" | "changes_requested";
  submittedBy: string;
  approvalParticipantId: string | null;
  createdAt: string;
  escalated: boolean;
  proposedChange: { before: unknown; after: unknown; impactSummary?: unknown };
  decidedBy?: string;
  decidedAt?: string;
  decisionReason?: string;
}

const STATUS_TOKENS: Record<RealApprovalCase["status"], { label: string; bg: string; text: string; dot: string }> = {
  draft: { label: "Draft", bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" },
  pending: { label: "Pending", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  approved: { label: "Approved", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  rejected: { label: "Rejected", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  changes_requested: { label: "Changes Requested", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
};

export default function ApprovalCard({
  approval,
  onDecide,
  deciding,
  error,
}: {
  approval: RealApprovalCase;
  onDecide: (id: string, decision: ApprovalDecision, reason: string) => void;
  deciding: boolean;
  error?: string | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const [reason, setReason] = useState("");

  const status = STATUS_TOKENS[approval.status];
  const actionable = approval.status === "pending";
  const isValueGate = approval.entityType === "value_gate_review";

  return (
    <div
      className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition hover:border-gray-300"
      data-testid="approval-card"
      data-case-id={approval.id}
      data-status={approval.status}
      data-entity-type={approval.entityType}
    >
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">{approval.entityType}</span>
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${status.bg} ${status.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
            {approval.escalated && (
              <span data-testid="escalated-badge" className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-medium text-red-700">
                <MessageSquareWarning className="h-3 w-3" /> Escalated
              </span>
            )}
          </div>

          <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1.5 block text-left text-[15px] font-semibold text-gray-900 hover:underline">
            {approval.entityId}
          </button>

          <p className="mt-1 text-xs text-gray-500">
            Submitted by <span data-testid="approval-submitted-by" className="font-mono">{approval.submittedBy}</span> · {new Date(approval.createdAt).toLocaleString()}
          </p>

          {expanded && (
            <div data-testid="approval-diff" className="mt-3 rounded-lg bg-gray-50 p-3">
              {renderDiffFor(approval.entityType, { entityId: approval.entityId, before: approval.proposedChange.before, after: approval.proposedChange.after, impactSummary: approval.proposedChange.impactSummary })}
              {approval.decidedBy && (
                <p data-testid="approval-decision-log" className="mt-2 text-xs text-gray-500">
                  {status.label} by <span className="font-mono">{approval.decidedBy}</span>
                  {approval.decidedAt ? ` · ${new Date(approval.decidedAt).toLocaleString()}` : ""}
                  {approval.decisionReason ? ` — "${approval.decisionReason}"` : ""}
                </p>
              )}
            </div>
          )}
        </div>

        <button type="button" onClick={() => setExpanded((v) => !v)} aria-label={expanded ? "Collapse details" : "Expand details"} className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600">
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {actionable && (
        <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50 p-4">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={isValueGate ? "Committee rationale (optional)" : "Rationale (required to reject or request changes)"}
            data-testid="decision-rationale"
            className="rounded-lg border border-gray-300 p-2 text-sm outline-none focus:border-indigo-500"
            rows={2}
          />
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
          {isValueGate ? (
            <div className="flex flex-wrap items-center gap-2" data-testid="value-gate-actions">
              <button type="button" disabled={deciding} onClick={() => onDecide(approval.id, "continue", reason.trim())} data-testid="continue-gate"
                className="flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-sm font-medium text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40">
                <Check className="h-3.5 w-3.5" /> Continue
              </button>
              <button type="button" disabled={deciding} onClick={() => onDecide(approval.id, "intervene", reason.trim())} data-testid="intervene-gate"
                className="flex items-center gap-1 rounded-lg border border-amber-200 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40">
                <CirclePause className="h-3.5 w-3.5" /> Intervene
              </button>
              <button type="button" disabled={deciding} onClick={() => onDecide(approval.id, "stop", reason.trim())} data-testid="stop-gate"
                className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">
                <OctagonX className="h-3.5 w-3.5" /> Stop
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={deciding} onClick={() => onDecide(approval.id, "approved", reason.trim())} data-testid="approve-case"
                className="flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-sm font-medium text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40">
                <Check className="h-3.5 w-3.5" /> Approve
              </button>
              <button type="button" disabled={deciding || !reason.trim()} onClick={() => onDecide(approval.id, "rejected", reason.trim())} data-testid="reject-case"
                className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">
                <X className="h-3.5 w-3.5" /> Reject
              </button>
              <button type="button" disabled={deciding || !reason.trim()} onClick={() => onDecide(approval.id, "changes_requested", reason.trim())} data-testid="request-changes-case"
                className="flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40">
                <MessageSquareWarning className="h-3.5 w-3.5" /> Request Changes
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
