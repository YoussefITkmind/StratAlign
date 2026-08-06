import { Worker, type Job } from "bullmq";
import type { Logger } from "../logging/logger";
import type { DeadLetterService } from "./dead-letter.service";
import type { QueueConnectionProvider } from "./queue-connection";
import type { QueueName } from "./queue.constants";
import { jitteredExponentialBackoff } from "./job-options";

export interface WorkerDefinition<TData = unknown> {
  queue: QueueName;
  concurrency: number;
  handle(job: Job<TData>): Promise<void>;
}

/**
 * Builds workers with uniform lifecycle handling: structured completion and
 * failure logs, and dead-lettering once a job has burned its final attempt.
 * Workers themselves stay thin adapters — all behaviour lives in services.
 */
export class WorkerFactory {
  private readonly workers: Worker[] = [];

  constructor(
    private readonly connectionProvider: QueueConnectionProvider,
    private readonly prefix: string,
    private readonly deadLetterService: DeadLetterService,
    private readonly logger: Logger,
  ) {}

  create<TData>(definition: WorkerDefinition<TData>): Worker<TData> {
    const workerLogger = this.logger.child("worker", {
      queue: definition.queue,
    });

    const worker = new Worker<TData>(
      definition.queue,
      async (job) => {
        const startedAt = Date.now();

        await definition.handle(job);

        workerLogger.debug("Job completed", {
          jobName: job.name,
          jobId: job.id,
          durationMs: Date.now() - startedAt,
        });
      },
      {
        prefix: this.prefix,
        concurrency: definition.concurrency,
        connection: this.connectionProvider.forConnection(
          `worker:${definition.queue}`,
        ),
        settings: {
          // Registered on the worker (not the queue — BullMQ resolves backoff
          // worker-side) so every retry in this codebase is jittered.
          backoffStrategy: (attemptsMade: number, _type, _error, job) =>
            jitteredExponentialBackoff(
              attemptsMade,
              typeof job?.opts.backoff === "object" && job.opts.backoff.delay
                ? job.opts.backoff.delay
                : 1_000,
            ),
        },
      },
    );

    worker.on("failed", (job, error) => {
      if (!job) {
        workerLogger.error("Job failed before it could be loaded", error);
        return;
      }

      const maxAttempts = job.opts.attempts ?? 1;
      const isFinalAttempt = job.attemptsMade >= maxAttempts;

      workerLogger.warn("Job attempt failed", {
        jobName: job.name,
        jobId: job.id,
        attemptsMade: job.attemptsMade,
        maxAttempts,
        isFinalAttempt,
        errorMessage: error.message,
      });

      if (isFinalAttempt) {
        void this.deadLetterService.record(definition.queue, job, error);
      }
    });

    worker.on("error", (error) => {
      workerLogger.error("Worker emitted an error", error);
    });

    this.workers.push(worker);

    return worker;
  }

  /**
   * Awaits in-flight jobs before returning. Callers must let this settle
   * before disconnecting Prisma, or running jobs lose their database handle
   * mid-transaction and fail spuriously on every deploy.
   */
  async closeAll(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
    this.workers.length = 0;
  }
}
