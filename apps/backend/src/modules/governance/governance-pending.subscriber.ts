import type {
  DomainEventEnvelope,
  EventSubscriber,
} from "../../events/event.types";

import {
  JOB_NAMES,
  QUEUE_NAMES,
  buildJobId,
} from "../../queue/queue.constants";

import type { QueueService } from "../../queue/queue.service";

import {
  GOVERNANCE_EVENT_TYPES,
} from "./governance.events";

export class GovernancePendingApprovalSubscriber
  implements EventSubscriber
{
  readonly id =
    "governance-pending-approval";

  readonly eventTypes = [
    GOVERNANCE_EVENT_TYPES.approvalPending,
  ] as const;

  constructor(
    private readonly queueService: QueueService,
  ) {}

  async handle(
    envelope: DomainEventEnvelope,
  ): Promise<void> {
    if (
      envelope.eventType !==
      GOVERNANCE_EVENT_TYPES.approvalPending
    ) {
      return;
    }

    const approvalCaseId =
      envelope.payload.approvalCaseId;

    const participantUserId =
      envelope.payload.participantUserId;

    const deadlineValue =
      envelope.payload.deadline;

    if (
      typeof approvalCaseId !== "string" ||
      typeof participantUserId !== "string" ||
      typeof deadlineValue !== "string"
    ) {
      throw new Error(
        "Invalid governance approval-pending event payload.",
      );
    }

    const deadline =
      new Date(deadlineValue);

    if (
      Number.isNaN(
        deadline.getTime(),
      )
    ) {
      throw new Error(
        "Invalid governance escalation deadline.",
      );
    }

    await this.queueService.enqueue(
      QUEUE_NAMES.governanceEscalation,

      JOB_NAMES.raiseGovernanceEscalation,

      {
        approvalCaseId,
        participantUserId,
        deadline:
          deadline.toISOString(),
      },

      {
        jobId: buildJobId(
          "governance-escalation",
          approvalCaseId,
          deadline.getTime(),
        ),

        delayMs: Math.max(
          0,
          deadline.getTime() -
            Date.now(),
        ),
      },
    );
  }
}
