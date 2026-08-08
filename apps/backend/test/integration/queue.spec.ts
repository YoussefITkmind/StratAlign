import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestHarness, waitFor, type TestHarness } from "./support/harness";
import { QUEUE_NAMES } from "../../src/queue/queue.constants";
import { TransientError } from "../../src/errors/app.errors";

/**
 * Exercises the real BullMQ integration against a real Redis: repeatable job
 * registration, job processing, job-id deduplication, delayed jobs, retry with
 * backoff, and dead-lettering.
 *
 * Nothing here waits on wall-clock time. Repeat intervals and delays are
 * compressed to milliseconds and every assertion polls for a condition.
 */
describe("BullMQ queue integration", () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness({ label: "queue" });
  });

  afterAll(async () => {
    await harness?.teardown();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  describe("queue processing", () => {
    it("delivers an enqueued job to its worker", async () => {
      const handled: unknown[] = [];

      harness.services.workerFactory.create({
        queue: QUEUE_NAMES.notificationDelivery,
        concurrency: 1,
        async handle(job) {
          handled.push(job.data);
        },
      });

      await harness.services.queueService.enqueue(
        QUEUE_NAMES.notificationDelivery,
        "test.job",
        { deliveryId: "abc" },
      );

      await waitFor("the job to be handled", async () =>
        handled.length > 0 ? handled : null,
      );

      expect(handled).toEqual([{ deliveryId: "abc" }]);
    });

    it("processes many jobs across a concurrent worker", async () => {
      const handled = new Set<number>();

      harness.services.workerFactory.create<{ index: number }>({
        queue: QUEUE_NAMES.eventsDispatch,
        concurrency: 4,
        async handle(job) {
          handled.add(job.data.index);
        },
      });

      for (let index = 0; index < 25; index += 1) {
        await harness.services.queueService.enqueue(
          QUEUE_NAMES.eventsDispatch,
          "test.job",
          { index },
        );
      }

      await waitFor("all 25 jobs to be handled", async () =>
        handled.size === 25 ? true : null,
      );

      expect(handled.size).toBe(25);
    });
  });

  describe("job id deduplication", () => {
    it("collapses two jobs sharing a job id into one execution", async () => {
      const handled: string[] = [];

      // Enqueue both before starting the worker, so the second add lands while
      // the first is still waiting — the window the job id has to cover.
      await harness.services.queueService.enqueue(
        QUEUE_NAMES.schedulerMaterialize,
        "test.job",
        { attempt: "first" },
        { jobId: "materialize--definition-1--42" },
      );

      await harness.services.queueService.enqueue(
        QUEUE_NAMES.schedulerMaterialize,
        "test.job",
        { attempt: "second" },
        { jobId: "materialize--definition-1--42" },
      );

      harness.services.workerFactory.create<{ attempt: string }>({
        queue: QUEUE_NAMES.schedulerMaterialize,
        concurrency: 1,
        async handle(job) {
          handled.push(job.data.attempt);
        },
      });

      await waitFor("the deduplicated job to run", async () =>
        handled.length > 0 ? handled : null,
      );

      // The queue must be empty afterwards: the second add was rejected, not
      // queued behind the first.
      await waitFor("the queue to drain", async () => {
        const waiting = await harness.services.queueService.countWaiting(
          QUEUE_NAMES.schedulerMaterialize,
        );
        return waiting === 0 ? true : null;
      });

      expect(handled).toEqual(["first"]);
    });
  });

  describe("delayed jobs", () => {
    it("does not run a delayed job before its delay elapses", async () => {
      const handled: string[] = [];

      harness.services.workerFactory.create<{ id: string }>({
        queue: QUEUE_NAMES.schedulerTransition,
        concurrency: 1,
        async handle(job) {
          handled.push(job.data.id);
        },
      });

      // Compressed: a 400ms delay stands in for a real milestone offset.
      await harness.services.queueService.enqueue(
        QUEUE_NAMES.schedulerTransition,
        "test.job",
        { id: "delayed" },
        { delayMs: 400 },
      );

      await harness.services.queueService.enqueue(
        QUEUE_NAMES.schedulerTransition,
        "test.job",
        { id: "immediate" },
      );

      await waitFor("the immediate job to run", async () =>
        handled.includes("immediate") ? true : null,
      );

      expect(handled).toEqual(["immediate"]);

      await waitFor("the delayed job to run", async () =>
        handled.includes("delayed") ? true : null,
      );

      expect(handled).toEqual(["immediate", "delayed"]);
    });
  });

  describe("repeatable jobs", () => {
    it("fires a registered repeatable job on its interval", async () => {
      let runs = 0;

      harness.services.workerFactory.create({
        queue: QUEUE_NAMES.schedulerTick,
        concurrency: 1,
        async handle() {
          runs += 1;
        },
      });

      // 60s in production; compressed to 60ms so the test observes several
      // firings without waiting real time.
      await harness.services.queueService.registerRepeatable(
        QUEUE_NAMES.schedulerTick,
        "test.tick",
        60,
        "integration-tick",
      );

      await waitFor("the repeatable job to fire at least three times", async () =>
        runs >= 3 ? true : null,
      );

      expect(runs).toBeGreaterThanOrEqual(3);
    });

    it("re-registering replaces the schedule instead of duplicating it", async () => {
      const queue = harness.services.queueService.getQueue(QUEUE_NAMES.schedulerTick);

      await harness.services.queueService.registerRepeatable(
        QUEUE_NAMES.schedulerTick,
        "test.tick",
        5_000,
        "integration-tick",
      );

      await harness.services.queueService.registerRepeatable(
        QUEUE_NAMES.schedulerTick,
        "test.tick",
        10_000,
        "integration-tick",
      );

      const schedulers = await queue.getJobSchedulers();
      const matching = schedulers.filter(
        (scheduler) => scheduler.key === "integration-tick",
      );

      // One scheduler, carrying the new interval: a configuration change must
      // take effect rather than leaving the old schedule running alongside.
      expect(matching).toHaveLength(1);
      expect(matching[0].every).toBe(10_000);
    });
  });

  /**
   * These use `events.relay`, whose policy is 3 attempts on a 1s jittered
   * base. That is the shortest real retry chain in the codebase, so the whole
   * chain completes in a couple of seconds without the test inventing its own
   * retry configuration — the production policy is what is under test.
   */
  describe("retry behaviour", () => {
    it("retries a transient failure and succeeds on a later attempt", async () => {
      const attempts: number[] = [];

      harness.services.workerFactory.create({
        queue: QUEUE_NAMES.eventsRelay,
        concurrency: 1,
        async handle(job) {
          attempts.push(job.attemptsMade);

          if (attempts.length < 3) {
            throw new TransientError("provider unavailable");
          }
        },
      });

      await harness.services.queueService.enqueue(
        QUEUE_NAMES.eventsRelay,
        "test.job",
        { deliveryId: "retry-me" },
      );

      await waitFor("the job to succeed after retries", async () =>
        attempts.length >= 3 ? true : null,
      );

      // attemptsMade increases across the chain rather than resetting.
      expect(attempts).toEqual([0, 1, 2]);
    });

    it("dead-letters a job that exhausts every attempt, preserving its payload", async () => {
      const recordSpy = vi.spyOn(harness.services.deadLetterService, "record");
      const deadLettered: unknown[] = [];

      harness.services.workerFactory.create({
        queue: QUEUE_NAMES.deadLetter,
        concurrency: 1,
        async handle(job) {
          deadLettered.push(job.data);
        },
      });

      harness.services.workerFactory.create({
        queue: QUEUE_NAMES.eventsRelay,
        concurrency: 1,
        async handle() {
          throw new TransientError("always fails");
        },
      });

      await harness.services.queueService.enqueue(
        QUEUE_NAMES.eventsRelay,
        "test.job",
        { recipientUserId: "user:ada" },
      );

      const records = await waitFor("the dead letter record to arrive", async () =>
        deadLettered.length > 0 ? deadLettered : null,
      );

      const [queueName, job, error] = recordSpy.mock.calls[0];

      expect(queueName).toBe(QUEUE_NAMES.eventsRelay);
      expect(job.data).toEqual({ recipientUserId: "user:ada" });
      expect((error as Error).message).toBe("always fails");

      const record = records[0] as Record<string, unknown>;

      // The record must carry enough to replay the job by hand.
      expect(record.queue).toBe(QUEUE_NAMES.eventsRelay);
      expect(record.data).toEqual({ recipientUserId: "user:ada" });
      expect(record.errorMessage).toBe("always fails");
      expect(record.attemptsMade).toBe(3);
    });

    it("does not dead-letter a job that eventually succeeds", async () => {
      const recordSpy = vi.spyOn(harness.services.deadLetterService, "record");
      let attempts = 0;

      harness.services.workerFactory.create({
        queue: QUEUE_NAMES.eventsRelay,
        concurrency: 1,
        async handle() {
          attempts += 1;

          if (attempts < 2) {
            throw new TransientError("first attempt fails");
          }
        },
      });

      await harness.services.queueService.enqueue(
        QUEUE_NAMES.eventsRelay,
        "test.job",
        { fine: true },
      );

      await waitFor("the job to succeed", async () => (attempts >= 2 ? true : null));

      expect(recordSpy).not.toHaveBeenCalled();
    });
  });
});
