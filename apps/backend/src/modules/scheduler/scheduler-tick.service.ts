import type { PrismaService } from "../../database/prisma.service";
import type { Logger } from "../../logging/logger";
import type { QueueService } from "../../queue/queue.service";
import { JOB_NAMES, QUEUE_NAMES, buildJobId } from "../../queue/queue.constants";
import { CadenceInstanceStatus, CadenceStatus } from "../../generated/prisma/enums";
import type { ScheduleTransitionService } from "./schedule-transition.service";

/** Statuses that still have a milestone ahead of them. */
const ADVANCEABLE_STATUSES = [
  CadenceInstanceStatus.PENDING,
  CadenceInstanceStatus.OPEN,
  CadenceInstanceStatus.CLOSING,
  CadenceInstanceStatus.CLOSED,
];

export interface SchedulerTickConfig {
  lookaheadSeconds: number;
  batchSize: number;
  tickIntervalMs: number;
  /**
   * The tick stops fanning out when the materialise queue is already this
   * deep, and resumes on the next pass. Without it, a slow materialiser plus a
   * fast tick queues work faster than it can be drained.
   */
  maxWaitingMaterializeJobs: number;
}

export interface TickResult {
  definitionsEnqueued: number;
  instancesEnqueued: number;
  throttled: boolean;
}

/**
 * The single periodic heartbeat of the scheduler.
 *
 * It performs two sweeps: definitions that are due to produce instances, and
 * instances that are due to advance a milestone. Both are queries against
 * Postgres, which stays the source of truth — Redis only carries the work.
 *
 * Runs at concurrency 1 with a fixed repeatable job id, so N worker replicas
 * still produce one tick per interval rather than N.
 */
export class SchedulerTickService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly transitionService: ScheduleTransitionService,
    private readonly config: SchedulerTickConfig,
    private readonly logger: Logger,
  ) {}

  async tick(now = new Date()): Promise<TickResult> {
    const waiting = await this.queueService.countWaiting(
      QUEUE_NAMES.schedulerMaterialize,
    );

    const throttled = waiting >= this.config.maxWaitingMaterializeJobs;

    const definitionsEnqueued = throttled
      ? 0
      : await this.enqueueDueDefinitions(now);

    const instancesEnqueued = await this.enqueueDueTransitions(now);

    if (throttled) {
      this.logger.warn("Skipped materialisation sweep; queue backlog too deep", {
        waiting,
        limit: this.config.maxWaitingMaterializeJobs,
      });
    }

    this.logger.debug("Scheduler tick complete", {
      definitionsEnqueued,
      instancesEnqueued,
      throttled,
    });

    return { definitionsEnqueued, instancesEnqueued, throttled };
  }

  private async enqueueDueDefinitions(now: Date): Promise<number> {
    const horizon = new Date(now.getTime() + this.config.lookaheadSeconds * 1000);

    const due = await this.prisma.cadenceDefinition.findMany({
      where: {
        status: CadenceStatus.ACTIVE,
        startsAt: { lte: horizon },
        OR: [
          { nextOccurrenceAt: { lte: horizon } },
          // Never materialised: pick it up on the first tick after creation.
          { nextOccurrenceAt: null, lastMaterializedAt: null },
        ],
      },
      orderBy: { nextOccurrenceAt: "asc" },
      take: this.config.batchSize,
      select: { id: true },
    });

    // One job per definition per tick window. A duplicate tick, or a tick that
    // overlaps the previous one, collapses onto the same job id.
    const bucket = Math.floor(now.getTime() / this.config.tickIntervalMs);

    for (const definition of due) {
      await this.queueService.enqueue(
        QUEUE_NAMES.schedulerMaterialize,
        JOB_NAMES.materializeDefinition,
        { cadenceDefinitionId: definition.id },
        { jobId: buildJobId("materialize", definition.id, bucket) },
      );
    }

    return due.length;
  }

  private async enqueueDueTransitions(now: Date): Promise<number> {
    // Reach one tick interval ahead so every milestone gets an exactly-timed
    // delayed job rather than waiting for the tick that follows it.
    const horizon = new Date(now.getTime() + this.config.tickIntervalMs);

    const due = await this.prisma.cadenceInstance.findMany({
      where: {
        status: { in: ADVANCEABLE_STATUSES },
        nextTransitionAt: { not: null, lte: horizon },
      },
      orderBy: { nextTransitionAt: "asc" },
      take: this.config.batchSize,
      select: { id: true, status: true, nextTransitionAt: true },
    });

    for (const instance of due) {
      if (instance.nextTransitionAt === null) {
        continue;
      }

      await this.transitionService.enqueueAdvance(
        instance.id,
        instance.status,
        instance.nextTransitionAt,
        now,
      );
    }

    return due.length;
  }
}
