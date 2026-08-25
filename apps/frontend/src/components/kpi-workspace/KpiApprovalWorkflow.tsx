"use client";

import { CheckCircle2, Clock3, RotateCcw, Send, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import type { KpiApproval } from "@/types/kpi-workspace";

interface ApprovalWorkflowKpi {
  id?: string;
  versionId?: string;
  name: string;
  approval: KpiApproval;
}

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

const STATUS_META: Record<KpiApproval, { label: string; className: string }> = {
  draft: { label: "Draft", className: "border-gray-200 bg-gray-50 text-gray-700" },
  pending: { label: "Pending Approval", className: "border-amber-200 bg-amber-50 text-amber-700" },
  changes_requested: { label: "Changes Requested", className: "border-orange-200 bg-orange-50 text-orange-700" },
  rejected: { label: "Rejected", className: "border-red-200 bg-red-50 text-red-700" },
  approved: { label: "Approved", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
};

const inputClass = "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

export default function KpiApprovalWorkflow({ row }: { row: ApprovalWorkflowKpi }) {
  const persisted = Boolean(row.id && row.versionId);
  const definitionId = row.id ?? EMPTY_UUID;
  const session = trpc.auth.session.useQuery();
  const caseQuery = trpc.governance.getLatestCaseForEntity.useQuery(
    { entityType: "KpiDefinition", entityId: definitionId },
    { enabled: persisted },
  );
  const registryQuery = trpc.registry.kpi.get.useQuery(
    { kpiDefinitionId: definitionId },
    { enabled: persisted },
  );
  const approversQuery = trpc.governance.listApprovers.useQuery(undefined, {
    enabled: persisted,
  });
  const submitMutation = trpc.governance.submit.useMutation();
  const decideMutation = trpc.governance.decide.useMutation();
  const resubmitMutation = trpc.governance.resubmit.useMutation();
  const publishMutation = trpc.registry.kpi.publishVersion.useMutation();
  const utils = trpc.useUtils();

  const [selectedApproverId, setSelectedApproverId] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  const currentUserId = session.data?.user.id;
  const approvalCase = caseQuery.data;
  const version = registryQuery.data?.version;
  const isPublished = Boolean(version?.publishedAt);
  const lifecycle: KpiApproval = isPublished
    ? "approved"
    : (approvalCase?.status as KpiApproval | undefined) ?? row.approval;
  const meta = STATUS_META[lifecycle];

  const approvers = approversQuery.data ?? [];
  const candidates = useMemo(
    () => approvers.filter((approver) => approver.id !== currentUserId),
    [approvers, currentUserId],
  );
  const effectiveApproverId = selectedApproverId || candidates[0]?.id || "";
  const assignedApprover = approvalCase?.approvalParticipantId
    ? approvers.find((approver) => approver.id === approvalCase.approvalParticipantId)
    : undefined;
  const assignedApproverLabel =
    approvalCase?.approvalParticipantId === currentUserId
      ? "You"
      : assignedApprover?.name ?? "Assigned approver";
  const isAssignedApprover = Boolean(
    currentUserId && approvalCase?.approvalParticipantId === currentUserId,
  );
  const isSubmitter = Boolean(currentUserId && approvalCase?.submittedBy === currentUserId);
  const canPublish = Boolean(
    currentUserId &&
      approvalCase &&
      (approvalCase.submittedBy === currentUserId || version?.ownerUserId === currentUserId),
  );
  const busy =
    submitMutation.isPending ||
    decideMutation.isPending ||
    resubmitMutation.isPending ||
    publishMutation.isPending;

  if (!persisted) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
        Approval actions are available for persisted Registry KPIs.
      </div>
    );
  }

  const refresh = async () => {
    await Promise.all([
      utils.kpiWorkspace.list.invalidate(),
      utils.registry.kpi.list.invalidate(),
      utils.registry.kpi.get.invalidate({ kpiDefinitionId: definitionId }),
      utils.governance.getLatestCaseForEntity.invalidate({
        entityType: "KpiDefinition",
        entityId: definitionId,
      }),
      utils.governance.getLatestCasesForEntities.invalidate(),
    ]);
    await Promise.all([caseQuery.refetch(), registryQuery.refetch()]);
  };

  const run = async (operation: () => Promise<unknown>) => {
    setWorkflowError(null);
    try {
      await operation();
      setDecisionReason("");
      await refresh();
    } catch (caught) {
      setWorkflowError(
        caught instanceof Error ? caught.message : "Unable to update the approval workflow.",
      );
    }
  };

  const submitForApproval = () => {
    if (!effectiveApproverId || !row.id || !row.versionId) return;
    void run(() =>
      submitMutation.mutateAsync({
        entityType: "KpiDefinition",
        entityId: row.id!,
        approvalParticipantId: effectiveApproverId,
        proposedChange: {
          before: {
            lifecycle: "draft",
            kpiDefinitionId: row.id,
            kpiVersionId: row.versionId,
          },
          after: {
            lifecycle: "approved",
            action: "publish",
            kpiDefinitionId: row.id,
            kpiVersionId: row.versionId,
            name: row.name,
          },
          impactSummary: {
            summary: `Approve KPI "${row.name}" for publication`,
          },
        },
      }),
    );
  };

  const decide = (decision: "approved" | "rejected" | "changes_requested") => {
    if (!approvalCase) return;
    void run(() =>
      decideMutation.mutateAsync({
        id: approvalCase.id,
        decision,
        ...(decisionReason.trim() ? { reason: decisionReason.trim() } : {}),
      }),
    );
  };

  const resubmit = () => {
    if (!approvalCase) return;
    void run(() => resubmitMutation.mutateAsync({ id: approvalCase.id }));
  };

  const publish = () => {
    if (!approvalCase || !row.versionId) return;
    void run(() =>
      publishMutation.mutateAsync({
        kpiVersionId: row.versionId!,
        approvalCaseId: approvalCase.id,
      }),
    );
  };

  if (caseQuery.isLoading || registryQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
        <Clock3 className="h-4 w-4" /> Loading approval workflow…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border p-4 ${meta.className}`}>
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Governance lifecycle</p>
        <div className="mt-1 flex items-center gap-2">
          {isPublished ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
          <p className="font-semibold">{isPublished ? "Approved & Published" : meta.label}</p>
        </div>
      </div>

      {(caseQuery.error || registryQuery.error || approversQuery.error || workflowError) && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {workflowError ?? caseQuery.error?.message ?? registryQuery.error?.message ?? approversQuery.error?.message}
        </p>
      )}

      {!isPublished && lifecycle === "draft" && !approvalCase && (
        <div className="space-y-3 rounded-xl border border-gray-100 p-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">Submit for approval</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              Choose a different user to review this KPI before it can be published.
            </p>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Approver</span>
            <select
              value={effectiveApproverId}
              onChange={(event) => setSelectedApproverId(event.target.value)}
              className={inputClass}
              disabled={approversQuery.isLoading || candidates.length === 0}
            >
              {candidates.length === 0 && <option value="">No other users available</option>}
              {candidates.map((approver) => (
                <option key={approver.id} value={approver.id}>{approver.name}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !effectiveApproverId}
            onClick={submitForApproval}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
          >
            <Send className="h-4 w-4" /> {submitMutation.isPending ? "Submitting…" : "Submit for Approval"}
          </button>
        </div>
      )}

      {!isPublished && lifecycle === "pending" && approvalCase && (
        <div className="space-y-3 rounded-xl border border-amber-100 p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-gray-500">Assigned approver</span>
            <span className="font-semibold text-gray-800">{assignedApproverLabel}</span>
          </div>
          {isAssignedApprover ? (
            <>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700">Decision note</span>
                <textarea
                  value={decisionReason}
                  onChange={(event) => setDecisionReason(event.target.value)}
                  className={`${inputClass} min-h-20 resize-none`}
                  placeholder="Optional for approval; required for changes or rejection."
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => decide("approved")}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                <CheckCircle2 className="h-4 w-4" /> Approve
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy || !decisionReason.trim()}
                  onClick={() => decide("changes_requested")}
                  className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-40"
                >
                  Request Changes
                </button>
                <button
                  type="button"
                  disabled={busy || !decisionReason.trim()}
                  onClick={() => decide("rejected")}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-40"
                >
                  <XCircle className="h-4 w-4" /> Reject
                </button>
              </div>
            </>
          ) : (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
              Waiting for {assignedApproverLabel} to review this KPI.
            </p>
          )}
        </div>
      )}

      {!isPublished && lifecycle === "changes_requested" && approvalCase && (
        <div className="space-y-3 rounded-xl border border-orange-200 bg-orange-50/40 p-4">
          <div>
            <p className="text-sm font-semibold text-orange-800">Changes requested</p>
            <p className="mt-1 text-sm text-orange-700">
              {approvalCase.decisionReason || "The approver requested changes before publication."}
            </p>
          </div>
          {isSubmitter ? (
            <button
              type="button"
              disabled={busy}
              onClick={resubmit}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" /> {resubmitMutation.isPending ? "Resubmitting…" : "Resubmit for Approval"}
            </button>
          ) : (
            <p className="text-xs text-orange-700">Waiting for the original submitter to resubmit.</p>
          )}
        </div>
      )}

      {!isPublished && lifecycle === "approved" && approvalCase && (
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
          <div>
            <p className="text-sm font-semibold text-emerald-800">Approval granted</p>
            <p className="mt-1 text-xs text-emerald-700">Governance has approved this KPI version for publication.</p>
          </div>
          {canPublish ? (
            <button
              type="button"
              disabled={busy || !row.versionId}
              onClick={publish}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              <CheckCircle2 className="h-4 w-4" /> {publishMutation.isPending ? "Publishing…" : "Publish KPI"}
            </button>
          ) : (
            <p className="text-xs text-emerald-700">Waiting for the KPI owner or submitter to publish.</p>
          )}
        </div>
      )}

      {!isPublished && lifecycle === "rejected" && approvalCase && (
        <div className="rounded-xl border border-red-200 bg-red-50/40 p-4">
          <p className="text-sm font-semibold text-red-800">Approval rejected</p>
          <p className="mt-1 text-sm text-red-700">
            {approvalCase.decisionReason || "This approval case was rejected."}
          </p>
        </div>
      )}

      {isPublished && (
        <div className="rounded-xl border border-emerald-100 p-4 text-sm text-gray-600">
          This Registry version is live. Its publication is backed by the approved Governance case.
        </div>
      )}
    </div>
  );
}
