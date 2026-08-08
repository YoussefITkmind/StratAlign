import type { PrismaService } from "../../database/prisma.service";
import type { Logger } from "../../logging/logger";
import type { EventBusService } from "../../events/event-bus.service";
import type { QueueService } from "../../queue/queue.service";
import { JOB_NAMES, QUEUE_NAMES, buildJobId } from "../../queue/queue.constants";
import type { Prisma } from "../../generated/prisma/client";
import { CadenceInstanceStatus } from "../../generated/prisma/enums";
import {
  SCHEDULE_AGGREGATE_TYPE,
  SCHEDULE_EVENT_TYPES,
  SCHEDULE_EVENT_VERSION,
  type ScheduleEventPayload,
  type ScheduleEventType,
} from "./scheduler.events";

/**
 * Guards against an instance with degenerate offsets (every milestone at the
 * same instant) looping further than its own state machine can go.
 */
const MAX_TRANSITIONS_PER_PASS = 8;

type MilestoneField =
  | "windowOpensAt"
  | "windowClosingAt"
  | "windowClosesAt"
  | "reviewDueAt";

type StampField =
  | "openedAt"
  | "closingNotifiedAt"
  | "closedAt"
  | "reviewNotifiedAt";

interface TransitionRule {
  from: CadenceInstanceStatus;
  to: CadenceInstanceStatus;
  dueAt: MilestoneField;
  stamp: StampField;
  eventType: ScheduleEventType;
}

/**
 * The instance state machine, in order. Each rule publishes exactly one event,
 * and the next rule's `dueAt` becomes the instance's `nextTransitionAt`.
 */
const TRANSITIONS: readonly TransitionRule[] = [
  {
    from: CadenceInstanceStatus.PENDING,
    to: CadenceInstanceStatus.OPEN,
    dueAt: "windowOpensAt",
    stamp: "openedAt",
    eventType: SCHEDULE_EVENT_TYPES.windowOpened,
  },
  {
    from: CadenceInstanceStatus.OPEN,
    to: CadenceInstanceStatus.CLOSING,
    dueAt: "windowClosingAt",
    stamp: "closingNotifiedAt",
    eventType: SCHEDULE_EVENT_TYPES.windowClosing,
  },
  {
    from: CadenceInstanceStatus.CLOSING,
    to: CadenceInstanceStatus.CLOSED,
    dueAt: "windowClosesAt",
    stamp: "closedAt",
    eventType: SCHEDULE_EVENT_TYPES.windowClosed,
  },
  {
    from: CadenceInstanceStatus.CLOSED,
    to: CadenceInstanceStatus.REVIEW_DUE,
    dueAt: "reviewDueAt",
    stamp: "reviewNotifiedAt",
    eventType: SCHEDULE_EVENT_TYPES.reviewDue,
  },
];

function ruleFor(status: CadenceInstanceStatus): TransitionRule | undefined {
  return TRANSITIONS.find((transition) => transition.from === status);
}

export interface AdvanceResult {
  transitions: number;
  status: CadenceInstanceStatus;
}

/**
 * Advances instances through their window milestones, publishing one generic
 * event per milestone.
 *
 * Each step writes the status change and its event in a single transaction, so
 * an event can never exist without the state it announces, and vice versa.
 */
export class ScheduleTransitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly queueService: QueueService,
    private readonly logger: Logger,
  ) {}

  /**
   * Applies every milestone that is already due, up to the safety cap. Doing
   * this in a loop rather than one-per-job means an instance whose offsets
   * coincide, or one recovering from downtime, catches up immediately instead
   * of one milestone per tick.
   */
  async advance(
    cadenceInstanceId: string,
    now = new Date(),
  ): Promise<AdvanceResult> {
    let transitions = 0;
    let status: CadenceInstanceStatus = CadenceInstanceStatus.PENDING;

    for (let pass = 0; pass < MAX_TRANSITIONS_PER_PASS; pass += 1) {
      const applied = await this.applyNextTransition(cadenceInstanceId, now);

      status = applied.status;

      if (!applied.transitioned) {
        break;
      }

      transitions += 1;
    }

    if (transitions > 0) {
      await this.eventBus.nudgeRelay();
    }

    return { transitions, status };
  }

  private async applyNextTransition(
    cadenceInstanceId: string,
    now: Date,
  ): Promise<{ transitioned: boolean; status: CadenceInstanceStatus }> {
    return this.prisma.$transaction<{
      transitioned: boolean;
      status: CadenceInstanceStatus;
    }>(async (tx) => {
      const instance = await tx.cadenceInstance.findUnique({
        where: { id: cadenceInstanceId },
        include: { cadenceDefinition: true },
      });

      if (!instance) {
        return { transitioned: false, status: CadenceInstanceStatus.FAILED };
      }

      const rule = ruleFor(instance.status);

      if (!rule) {
        // Terminal, skipped, or already completed: nothing further to do.
        return { transitioned: false, status: instance.status };
      }

      const dueAt = instance[rule.dueAt];

      if (dueAt.getTime() > now.getTime()) {
        return { transitioned: false, status: instance.status };
      }

      const nextRule = ruleFor(rule.to);
      const nextTransitionAt = nextRule ? instance[nextRule.dueAt] : null;

      // The status guard makes this a compare-and-set: if another worker got
      // here first its update already moved the row, this one matches nothing,
      // and no duplicate event is written.
      const updated = await tx.cadenceInstance.updateMany({
        where: { id: cadenceInstanceId, status: rule.from },
        data: {
          status: rule.to,
          [rule.stamp]: now,
          nextTransitionAt:
            rule.to === CadenceInstanceStatus.REVIEW_DUE ? null : nextTransitionAt,
        },
      });

      if (updated.count === 0) {
        return { transitioned: false, status: instance.status };
      }

      const payload = this.buildPayload(instance);

      await this.eventBus.publishWithin(tx, [
        {
          eventType: rule.eventType,
          eventVersion: SCHEDULE_EVENT_VERSION,
          aggregateType: SCHEDULE_AGGREGATE_TYPE,
          aggregateId: instance.id,
          // One event per instance per milestone, forever.
          dedupeKey: `${instance.id}:${rule.eventType}`,
          occurredAt: now,
          payload,
        },
      ]);

      this.logger.info("Published schedule event", {
        cadenceInstanceId: instance.id,
        cadenceDefinitionId: instance.cadenceDefinitionId,
        eventType: rule.eventType,
        subjectType: instance.cadenceDefinition.subjectType,
      });

      return { transitioned: true, status: rule.to };
    });
  }

  /**
   * Marks an instance terminally complete once its review milestone has been
   * announced. Kept separate from `advance` because REVIEW_DUE is the last
   * state anyone is notified about; completion is bookkeeping.
   */
  async complete(cadenceInstanceId: string): Promise<void> {
    await this.prisma.cadenceInstance.updateMany({
      where: {
        id: cadenceInstanceId,
        status: CadenceInstanceStatus.REVIEW_DUE,
      },
      data: {
        status: CadenceInstanceStatus.COMPLETED,
        nextTransitionAt: null,
      },
    });
  }

  async recordFailure(cadenceInstanceId: string, error: unknown): Promise<void> {
    await this.prisma.cadenceInstance.update({
      where: { id: cadenceInstanceId },
      data: {
        attempts: { increment: 1 },
        lastError: error instanceof Error ? error.message : String(error),
      },
    });
  }

  /**
   * Re-enqueues an instance for its next milestone. Used by the tick sweep.
   */
  async enqueueAdvance(
    cadenceInstanceId: string,
    status: CadenceInstanceStatus,
    nextTransitionAt: Date,
    now: Date,
  ): Promise<void> {
    await this.queueService.enqueue(
      QUEUE_NAMES.schedulerTransition,
      JOB_NAMES.advanceInstance,
      { cadenceInstanceId },
      {
        jobId: buildJobId("advance", cadenceInstanceId, status),
        delayMs: Math.max(0, nextTransitionAt.getTime() - now.getTime()),
      },
    );
  }

  private buildPayload(instance: {
    id: string;
    sequence: number;
    occurrenceAt: Date;
    windowOpensAt: Date;
    windowClosingAt: Date;
    windowClosesAt: Date;
    reviewDueAt: Date;
    periodKey: string | null;
    periodStartsAt: Date | null;
    periodEndsAt: Date | null;
    payloadSnapshot: Prisma.JsonValue;
    cadenceDefinitionId: string;
    cadenceDefinition: {
      key: string;
      subjectType: string;
      subjectId: string;
      timezone: string;
    };
  }): ScheduleEventPayload {
    return {
      cadenceDefinitionId: instance.cadenceDefinitionId,
      cadenceDefinitionKey: instance.cadenceDefinition.key,
      cadenceInstanceId: instance.id,
      sequence: instance.sequence,
      subjectType: instance.cadenceDefinition.subjectType,
      subjectId: instance.cadenceDefinition.subjectId,
      occurrenceAt: instance.occurrenceAt.toISOString(),
      windowOpensAt: instance.windowOpensAt.toISOString(),
      windowClosingAt: instance.windowClosingAt.toISOString(),
      windowClosesAt: instance.windowClosesAt.toISOString(),
      reviewDueAt: instance.reviewDueAt.toISOString(),
      periodKey: instance.periodKey,
      periodStartsAt: instance.periodStartsAt?.toISOString() ?? null,
      periodEndsAt: instance.periodEndsAt?.toISOString() ?? null,
      timezone: instance.cadenceDefinition.timezone,
      payload: (instance.payloadSnapshot ?? {}) as Record<string, unknown>,
    };
  }
}
