export const GOVERNANCE_EVENT_VERSION = 1;

export const GOVERNANCE_EVENT_TYPES = {
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
