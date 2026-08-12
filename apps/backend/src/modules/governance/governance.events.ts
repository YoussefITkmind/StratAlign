export const GOVERNANCE_EVENT_VERSION = 1;

export const GOVERNANCE_EVENT_TYPES = {
  approvalPending: "governance.approval.pending",
  approvalGranted: "governance.approval.granted",
  approvalRejected: "governance.approval.rejected",
  escalationRaised: "governance.escalation.raised",
} as const;

export const GOVERNANCE_AGGREGATE_TYPE = "ApprovalCase";

export interface GovernanceDecisionPayload
  extends Record<string, unknown> {
  approvalCaseId: string;
  entityType: string;
  entityId: string;
  submittedBy: string;
  decidedBy: string;
  rationale: string | null;
  proposedChange: {
    before: unknown;
    after: unknown;
    impactSummary?: unknown;
  };
}

export function governanceDecisionDedupeKey(
  eventType: string,
  approvalCaseId: string,
): string {
  return `${eventType}:${approvalCaseId}`;
}


export interface GovernanceApprovalPendingPayload
  extends Record<string, unknown> {
  approvalCaseId: string;
  entityType: string;
  entityId: string;
  participantUserId: string;
  deadline: string;
}

export interface GovernanceEscalationRaisedPayload
  extends Record<string, unknown> {
  escalationCaseId: string;
  approvalCaseId: string;
  participantUserId: string;
  deadline: string;
}

export function governancePendingDedupeKey(
  approvalCaseId: string,
  deadline: Date,
): string {
  return [
    GOVERNANCE_EVENT_TYPES.approvalPending,
    approvalCaseId,
    deadline.toISOString(),
  ].join(":");
}

export function governanceEscalationDedupeKey(
  approvalCaseId: string,
  participantUserId: string,
  deadline: Date,
): string {
  return [
    GOVERNANCE_EVENT_TYPES.escalationRaised,
    approvalCaseId,
    participantUserId,
    deadline.toISOString(),
  ].join(":");
}
