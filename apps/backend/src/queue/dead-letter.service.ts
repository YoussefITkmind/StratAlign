import type { Job } from "bullmq";
import type { Logger } from "../logging/logger";
import type { QueueService } from "./queue.service";
import { JOB_NAMES, QUEUE_NAMES, type QueueName } from "./queue.constants";

export interface DeadLetterRecord {
  queue: QueueName;
  jobName: string;
  jobId: string | undefined;
  attemptsMade: number;
  failedAt: string;
  errorMessage: string;
  errorStack: string | undefined;
  data: unknown;
}

/**
 * Terminal failures are parked on a dedicated queue with their original
 * payload so they can be inspected and replayed, instead of vanishing when
 * BullMQ's failed-job retention expires.
 */
export class DeadLetterService {
  constructor(
    private readonly queueService: QueueService,
    private readonly logger: Logger,
  ) {}

  async record(
    queue: QueueName,
    job: Job,
    error: unknown,
  ): Promise<void> {
    const record: DeadLetterRecord = {
      queue,
      jobName: job.name,
      jobId: job.id,
      attemptsMade: job.attemptsMade,
      failedAt: new Date().toISOString(),
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      data: job.data,
    };

    this.logger.error("Job exhausted its retries; moving to dead letter", error, {
      queue,
      jobName: job.name,
      jobId: job.id,
      attemptsMade: job.attemptsMade,
    });

    try {
      await this.queueService.enqueue(
        QUEUE_NAMES.deadLetter,
        JOB_NAMES.deadLetter,
        record,
      );
    } catch (enqueueError: unknown) {
      // Never let dead-lettering itself throw: the original failure is already
      // logged above, and losing that log to a secondary Redis error is worse.
      this.logger.error(
        "Failed to enqueue dead letter record",
        enqueueError,
        { queue, jobId: job.id },
      );
    }
  }
}
