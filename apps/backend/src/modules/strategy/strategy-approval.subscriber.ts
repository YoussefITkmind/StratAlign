import type { StrategyService } from "./strategy.service";

export interface GovernanceApprovalGrantedEvent {
  eventType: "governance.approval.granted";
  payload: { approvalCaseId: string };
}

/**
 * Strategy-side subscriber for Prompt 1.5's approval event.
 * The outbox/relay may deliver more than once, so StrategyService only selects
 * pending staged changes. A replay therefore becomes an idempotent no-op.
 */
export class StrategyApprovalSubscriber {
  constructor(private readonly strategy: StrategyService) {}

  async handle(event: GovernanceApprovalGrantedEvent): Promise<number> {
    if (event.eventType !== "governance.approval.granted") return 0;
    return this.strategy.applyApprovedChanges(event.payload.approvalCaseId);
  }
}
