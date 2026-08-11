import type { DomainEventEnvelope, EventSubscriber } from "../../events/event.types";
import type { StrategyService } from "./strategy.service";

/**
 * Applies staged strategy mutations only after Prompt 1.5 publishes
 * governance.approval.granted. The outbox is at-least-once, and the service
 * selects only pending staged changes, so duplicate delivery is idempotent.
 */
export class StrategyApprovalSubscriber implements EventSubscriber {
  readonly id = "strategy-approval-granted";
  readonly eventTypes = ["governance.approval.granted"] as const;

  constructor(private readonly strategy: StrategyService) {}

  async handle(envelope: DomainEventEnvelope): Promise<void> {
    if (envelope.eventType !== "governance.approval.granted") return;
    const approvalCaseId = envelope.payload.approvalCaseId;
    if (typeof approvalCaseId !== "string" || approvalCaseId.length === 0) {
      throw new Error("governance.approval.granted is missing approvalCaseId");
    }
    await this.strategy.applyApprovedChanges(approvalCaseId);
  }
}
