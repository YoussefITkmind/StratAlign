import type {
  DomainEventEnvelope,
  EventSubscriber,
} from "../../events/event.types";

import {
  GOVERNANCE_EVENT_TYPES,
} from "../governance/governance.events";

import type {
  StrategyActivationService,
} from "./strategy-activation.service";

export const STRATEGY_STAGED_CHANGE_ENTITY_TYPE =
  "StrategyStagedChange";

/**
 * Applies exactly the staged strategy mutation referenced
 * by a successful Governance approval.
 *
 * Governance publishes one generic approval event contract:
 *
 *   entityType -> identifies the governed aggregate type
 *   entityId   -> identifies the exact governed aggregate
 *
 * Strategy therefore consumes only approval events whose
 * governed entity is a StrategyStagedChange.
 *
 * Duplicate delivery remains idempotent because activation
 * only selects staged changes whose status is 'pending'.
 */
export class StrategyApprovalSubscriber
  implements EventSubscriber
{
  readonly id =
    "strategy-approval-granted";

  readonly eventTypes = [
    GOVERNANCE_EVENT_TYPES.approvalGranted,
  ] as const;

  constructor(
    private readonly activation:
      StrategyActivationService,
  ) {}

  async handle(
    envelope: DomainEventEnvelope,
  ): Promise<void> {
    if (
      envelope.eventType !==
      GOVERNANCE_EVENT_TYPES.approvalGranted
    ) {
      return;
    }

    const entityType =
      envelope.payload.entityType;

    /*
     * Governance approval events are shared by every
     * governed domain. Ignore approvals that do not govern
     * a Strategy staged change.
     */
    if (
      entityType !==
      STRATEGY_STAGED_CHANGE_ENTITY_TYPE
    ) {
      return;
    }

    const stagedChangeId =
      envelope.payload.entityId;

    const approvalCaseId =
      envelope.payload.approvalCaseId;

    if (
      typeof stagedChangeId !== "string" ||
      stagedChangeId.length === 0
    ) {
      throw new Error(
        "Strategy approval event is missing entityId",
      );
    }

    if (
      typeof approvalCaseId !== "string" ||
      approvalCaseId.length === 0
    ) {
      throw new Error(
        "Strategy approval event is missing approvalCaseId",
      );
    }

    await this.activation.activate(
      stagedChangeId,
      approvalCaseId,
    );
  }
}
