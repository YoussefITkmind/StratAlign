import { Queue, type JobsOptions } from "bullmq";
import type { Logger } from "../logging/logger";
import type { QueueConnectionProvider } from "./queue-connection";
import { QUEUE_NAMES, type QueueName } from "./queue.constants";
import { defaultJobOptions } from "./job-options";

export interface EnqueueOptions {
  /**
   * Stable identifier. BullMQ refuses a second job with the same id while the
   * first is still retained, which is how this codebase makes duplicate
   * production harmless rather than something callers must coordinate around.
   */
  jobId?: string;
  delayMs?: number;
  priority?: number;
}

/**
 * Owns the BullMQ `Queue` instances. Producers depend on this, never on
 * BullMQ directly, so the queue technology stays replaceable from one place.
 */
export class QueueService {
  private readonly queues = new Map<QueueName, Queue>();

  constructor(
    private readonly connectionProvider: QueueConnectionProvider,
    private readonly prefix: string,
    private readonly logger: Logger,
  ) {}

  getQueue(name: QueueName): Queue {
    const existing = this.queues.get(name);

    if (existing) {
      return existing;
    }

    const queue = new Queue(name, {
      prefix: this.prefix,
      connection: this.connectionProvider.forConnection(`queue:${name}`),
      defaultJobOptions: defaultJobOptions(name),
    });

    this.queues.set(name, queue);

    return queue;
  }

  async enqueue(
    name: QueueName,
    jobName: string,
    data: unknown,
    options: EnqueueOptions = {},
  ): Promise<void> {
    const jobOptions: JobsOptions = {};

    if (options.jobId !== undefined) {
      jobOptions.jobId = options.jobId;
    }

    if (options.delayMs !== undefined && options.delayMs > 0) {
      jobOptions.delay = options.delayMs;
    }

    if (options.priority !== undefined) {
      jobOptions.priority = options.priority;
    }

    await this.getQueue(name).add(jobName, data, jobOptions);
  }

  /**
   * Registers (or re-registers) a repeatable job. Called once at worker
   * start-up; the fixed job id keeps replicas from multiplying the schedule.
   */
  async registerRepeatable(
    name: QueueName,
    jobName: string,
    everyMs: number,
    repeatJobId: string,
    data: unknown = {},
  ): Promise<void> {
    const queue = this.getQueue(name);

    // Removed first so a changed interval in configuration actually takes
    // effect instead of leaving the previous scheduler in place.
    await queue.removeJobScheduler(repeatJobId).catch(() => false);

    await queue.upsertJobScheduler(
      repeatJobId,
      { every: everyMs },
      { name: jobName, data },
    );

    this.logger.info("Registered repeatable job", {
      queue: name,
      jobName,
      everyMs,
      repeatJobId,
    });
  }

  async removeJob(name: QueueName, jobId: string): Promise<boolean> {
    const job = await this.getQueue(name).getJob(jobId);

    if (!job) {
      return false;
    }

    await job.remove();

    return true;
  }

  async countWaiting(name: QueueName): Promise<number> {
    return this.getQueue(name).getWaitingCount();
  }

  /** Closes every queue, and with it the connections BullMQ opened for them. */
  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.queues.clear();
  }
}

export { QUEUE_NAMES };
