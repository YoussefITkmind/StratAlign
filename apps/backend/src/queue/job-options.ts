import type { JobsOptions } from "bullmq";
import { QUEUE_NAMES, type QueueName } from "./queue.constants";

/**
 * Retention is bounded because Redis is a transport here, not the record of
 * truth — Postgres holds the durable state. Failed jobs are kept longer than
 * completed ones so an incident can still be investigated the next morning.
 */
const COMPLETED_RETENTION = { age: 24 * 60 * 60, count: 1000 } as const;
const FAILED_RETENTION = { age: 7 * 24 * 60 * 60 } as const;

const BASE_OPTIONS: JobsOptions = {
  removeOnComplete: COMPLETED_RETENTION,
  removeOnFail: FAILED_RETENTION,
};

/**
 * Every backoff is jittered. Without jitter, a provider outage synchronises
 * all retries onto the same instant and the recovery stampede takes the
 * provider straight back down.
 */
const RETRY_POLICIES: Record<QueueName, JobsOptions> = {
  [QUEUE_NAMES.schedulerTick]: {
    attempts: 1,
  },
  [QUEUE_NAMES.schedulerMaterialize]: {
    attempts: 5,
    backoff: { type: "jittered-exponential", delay: 2_000 },
  },
  [QUEUE_NAMES.schedulerTransition]: {
    attempts: 5,
    backoff: { type: "jittered-exponential", delay: 2_000 },
  },
  [QUEUE_NAMES.eventsRelay]: {
    attempts: 3,
    backoff: { type: "jittered-exponential", delay: 1_000 },
  },
  [QUEUE_NAMES.eventsDispatch]: {
    attempts: 5,
    backoff: { type: "jittered-exponential", delay: 2_000 },
  },
  [QUEUE_NAMES.notificationDelivery]: {
    attempts: 5,
    backoff: { type: "jittered-exponential", delay: 30_000 },
  },
  [QUEUE_NAMES.notificationDigest]: {
    attempts: 3,
    backoff: { type: "jittered-exponential", delay: 10_000 },
  },
  [QUEUE_NAMES.deadLetter]: {
    attempts: 1,
  },
};

export function defaultJobOptions(queueName: QueueName): JobsOptions {
  return {
    ...BASE_OPTIONS,
    ...RETRY_POLICIES[queueName],
  };
}

/** Upper bound on any single backoff, so a stalled provider cannot push the
 * next attempt hours out. */
export const MAX_BACKOFF_MS = 60 * 60 * 1000;

/**
 * Registered on every queue as a custom backoff strategy. `attemptsMade`
 * starts at 1, so the first retry waits roughly `delay`.
 */
export function jitteredExponentialBackoff(
  attemptsMade: number,
  baseDelayMs: number,
): number {
  const exponential = baseDelayMs * 2 ** Math.max(0, attemptsMade - 1);
  const capped = Math.min(exponential, MAX_BACKOFF_MS);

  // Full jitter: uniformly distributed in [capped/2, capped].
  return Math.round(capped / 2 + Math.random() * (capped / 2));
}
