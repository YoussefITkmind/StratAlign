import { z } from "zod";
import { PermanentError } from "../errors/app.errors";
import type { Logger } from "../logging/logger";
import { QUEUE_NAMES } from "../queue/queue.constants";
import type { WorkerDefinition } from "../queue/worker.factory";
import type { CadenceGeneratorService } from "../modules/scheduler/cadence-generator.service";
import type { ScheduleTransitionService } from "../modules/scheduler/schedule-transition.service";
import type { SchedulerTickService } from "../modules/scheduler/scheduler-tick.service";

const materializeJobSchema = z.object({
  cadenceDefinitionId: z.string().min(1),
});

const advanceJobSchema = z.object({
  cadenceInstanceId: z.string().min(1),
});

/**
 * Workers are adapters: validate the payload, call one service method, done.
 * Keeping them this thin is what lets the services be unit tested without
 * BullMQ anywhere in the picture.
 */
export function createSchedulerTickWorker(
  tickService: SchedulerTickService,
): WorkerDefinition {
  return {
    queue: QUEUE_NAMES.schedulerTick,
    // Must stay 1: the tick is a singleton sweep, not parallel work.
    concurrency: 1,
    async handle() {
      await tickService.tick();
    },
  };
}

export function createMaterializeWorker(
  generator: CadenceGeneratorService,
  concurrency: number,
): WorkerDefinition {
  return {
    queue: QUEUE_NAMES.schedulerMaterialize,
    concurrency,
    async handle(job) {
      const parsed = materializeJobSchema.safeParse(job.data);

      if (!parsed.success) {
        throw new PermanentError("Malformed materialise job payload", {
          jobId: job.id,
        });
      }

      await generator.materialize(parsed.data.cadenceDefinitionId);
    },
  };
}

export function createTransitionWorker(
  transitionService: ScheduleTransitionService,
  logger: Logger,
  concurrency: number,
): WorkerDefinition {
  return {
    queue: QUEUE_NAMES.schedulerTransition,
    concurrency,
    async handle(job) {
      const parsed = advanceJobSchema.safeParse(job.data);

      if (!parsed.success) {
        throw new PermanentError("Malformed transition job payload", {
          jobId: job.id,
        });
      }

      const { cadenceInstanceId } = parsed.data;

      try {
        const result = await transitionService.advance(cadenceInstanceId);

        logger.debug("Instance advanced", {
          cadenceInstanceId,
          transitions: result.transitions,
          status: result.status,
        });
      } catch (error: unknown) {
        // Recorded on the instance so a repeatedly failing occurrence is
        // visible in the database, not only in the queue.
        await transitionService.recordFailure(cadenceInstanceId, error);
        throw error;
      }
    },
  };
}
