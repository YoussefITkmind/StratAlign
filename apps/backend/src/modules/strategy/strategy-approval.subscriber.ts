import type { DomainEventEnvelope, EventSubscriber } from "../../events/event.types";
import type { StrategyActivationService } from "./strategy-activation.service";

/**
 * Applies exactly the staged strategy mutation referenced by an approval event.
 * Duplicate delivery is idempotent because activation selects status='pending'.
 */
export class StrategyApprovalSubscriber implements EventSubscriber {
  readonly id = "strategy-approval-granted";
  readonly eventTypes = ["governance.approval.granted"] as const;

  constructor(private readonly activation: StrategyActivationService) {}

  async handle(envelope: DomainEventEnvelope): Promise<void> {
    if (envelope.eventType !== "governance.approval.granted") return;

    const domain = envelope.payload.domain;
    const stagedChangeId = envelope.payload.stagedChangeId;
    const approvalCaseId = envelope.payload.approvalCaseId;

    // Governance events for other domains share the same event type.
    if (domain !== "strategy" && typeof stagedChangeId !== "string") return;
    if (typeof stagedChangeId !== "string" || stagedChangeId.length === 0) {
      throw new Error("Strategy approval event is missing stagedChangeId");
    }
    if (typeof approvalCaseId !== "string" || approvalCaseId.length === 0) {
      throw new Error("Strategy approval event is missing approvalCaseId");
    }

    await this.activation.activate(stagedChangeId, approvalCaseId);
  }
}
