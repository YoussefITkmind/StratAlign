import type { DomainEventEnvelope, EventSubscriber } from "../../events/event.types";
import {
  EXECUTION_STAGE_EVENT_TYPE,
  type InitiativeStageChangedPayload,
} from "../execution/execution-stage.events";

export interface StageGateReaction {
  createPendingFromStageTransition(payload: InitiativeStageChangedPayload): Promise<unknown>;
}

/**
 * Deliberate execution -> value cross-domain reaction. Execution owns the stage
 * write and emits an outbox event; Value Management reacts idempotently without
 * reaching into Execution's write path.
 */
export class ValueGateStageSubscriber implements EventSubscriber {
  readonly id = "value.gate-stage-transition";
  readonly eventTypes = [EXECUTION_STAGE_EVENT_TYPE] as const;

  constructor(private readonly value: StageGateReaction) {}

  async handle(envelope: DomainEventEnvelope): Promise<void> {
    if (envelope.eventType !== EXECUTION_STAGE_EVENT_TYPE) return;
    await this.value.createPendingFromStageTransition(
      envelope.payload as InitiativeStageChangedPayload,
    );
  }
}
