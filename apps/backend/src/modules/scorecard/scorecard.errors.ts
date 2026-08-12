export class ScorecardDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ScorecardDomainError";
  }
}

export const scorecardErrors = {
  notFound: (id: string) => new ScorecardDomainError("SCORECARD_NOT_FOUND", `Scorecard ${id} was not found`),
  perspectiveNotFound: (id: string) => new ScorecardDomainError("SCORECARD_PERSPECTIVE_NOT_FOUND", `Perspective ${id} was not found`),
  objectiveInvalid: (id: string) => new ScorecardDomainError("SCORECARD_OBJECTIVE_INVALID", `Objective ${id} must exist, be an objective, be active, and belong to the scorecard plan version`),
  ruleInvalid: (id: string) => new ScorecardDomainError("SCORECARD_SCORING_RULE_INVALID", `Rule ${id} must be a published rag_aggregation rule`),
  statusMissing: (perspectiveId: string) => new ScorecardDomainError("SCORECARD_STATUS_DATA_REQUIRED", `Perspective ${perspectiveId} has no current status data`),
  approvalRequired: () => new ScorecardDomainError("SCORECARD_APPROVAL_REQUIRED", "This structural scorecard change requires an approved workflow case"),
  mapNotFound: (id: string) => new ScorecardDomainError("SCORECARD_MAP_NOT_FOUND", `Strategy map ${id} was not found`),
  mapNotDraft: () => new ScorecardDomainError("SCORECARD_MAP_NOT_DRAFT", "Only draft strategy maps can be edited"),
  invalidProposal: () => new ScorecardDomainError("SCORECARD_PROPOSAL_INVALID", "The approved workflow case does not contain a valid scorecard proposal"),
};
