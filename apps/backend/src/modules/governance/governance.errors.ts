export class GovernanceCaseNotFoundError extends Error {
  readonly code = "GOVERNANCE_CASE_NOT_FOUND";

  constructor(caseId: string) {
    super(`Approval case ${caseId} was not found.`);
    this.name = "GovernanceCaseNotFoundError";
  }
}

export class GovernanceWorkflowNotFoundError extends Error {
  readonly code = "GOVERNANCE_WORKFLOW_NOT_FOUND";

  constructor(workflowKey: string) {
    super(`Workflow definition ${workflowKey} was not found.`);
    this.name = "GovernanceWorkflowNotFoundError";
  }
}

export class GovernanceIllegalTransitionError extends Error {
  readonly code = "GOVERNANCE_ILLEGAL_TRANSITION";

  constructor(
    caseId: string,
    currentState: string,
    eventType: string,
  ) {
    super(
      `Approval case ${caseId} cannot process ${eventType} from ${currentState}.`,
    );
    this.name = "GovernanceIllegalTransitionError";
  }
}

export class GovernanceApprovalReferenceError extends Error {
  readonly code = "GOVERNANCE_APPROVAL_REFERENCE_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "GovernanceApprovalReferenceError";
  }
}

export class GovernanceEscalationNotFoundError extends Error {
  readonly code = "GOVERNANCE_ESCALATION_NOT_FOUND";

  constructor(escalationId: string) {
    super(`Escalation case ${escalationId} was not found.`);
    this.name = "GovernanceEscalationNotFoundError";
  }
}

export class GovernanceEscalationParticipantError extends Error {
  readonly code = "GOVERNANCE_ESCALATION_PARTICIPANT_MISMATCH";

  constructor() {
    super("Only the assigned escalation participant can acknowledge this escalation.");
    this.name = "GovernanceEscalationParticipantError";
  }
}
