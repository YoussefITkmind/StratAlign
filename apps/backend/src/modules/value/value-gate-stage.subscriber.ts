import type { DomainEventEnvelope, EventSubscriber } from "../../events/event.types";
import {
  EXECUTION_STAGE_EVENT_TYPE,
  type InitiativeStageChangedPayload,
} from "../execution/execution-stage.events";

export interface StageGateReaction {
  createPendingFromStageTransition(payload: InitiativeStageChangedPayload): Promise<{ id: string }>;
  evaluateCriteria(gateReviewId: string, actorUserId: string): Promise<unknown>;
}

/**
 * Deliberate execution -> value cross-domain reaction. Execution owns the stage
 * write and emits an outbox event; Value Management reacts idempotently without
 * reaching into Execution's write path. Criteria may be evaluated automatically;
 * the committee decision itself remains structurally human-only.
 */
export class ValueGateStageSubscriber implements EventSubscriber {
  readonly id = "value.gate-stage-transition";
  readonly eventTypes = [EXECUTION_STAGE_EVENT_TYPE] as const;

  constructor(private readonly value: StageGateReaction) {}

  async handle(envelope: DomainEventEnvelope): Promise<void> {
    if (envelope.eventType !== EXECUTION_STAGE_EVENT_TYPE) return;
    const payload = envelope.payload as InitiativeStageChangedPayload;
    const gate = await this.value.createPendingFromStageTransition(payload);
    await this.value.evaluateCriteria(gate.id, payload.requestedBy);
  }
}
