import "dotenv/config";
import { validateEnvironment } from "./config/env.validation";
import { createServiceGraph } from "./bootstrap";
import { JOB_NAMES, QUEUE_NAMES, REPEATABLE_JOB_IDS } from "./queue/queue.constants";
import {
  createMaterializeWorker,
  createSchedulerTickWorker,
  createTransitionWorker,
} from "./workers/scheduler.workers";
import {
  createEventDispatchWorker,
  createOutboxRelayWorker,
} from "./workers/event.workers";
import {
  createDigestSweepWorker,
  createNotificationDeliveryWorker,
} from "./workers/notification.workers";

/**
 * Background worker entrypoint.
 *
 * Workers run as their own process rather than inside the API server: a hot
 * materialisation loop and an HTTP request handler on one event loop compete
 * for the same time, and the two scale on completely different axes. They
 * share the service graph, so behaviour is identical either way.
 */
async function bootstrap(): Promise<void> {
  const environment = validateEnvironment(process.env);
  const services = createServiceGraph(environment);
  const logger = services.logger.child("worker-main");

  await services.connect();

  const concurrency = environment.WORKER_CONCURRENCY;

  services.workerFactory.create(createSchedulerTickWorker(services.tickService));
  services.workerFactory.create(
    createMaterializeWorker(services.cadenceGenerator, concurrency),
  );
  services.workerFactory.create(
    createTransitionWorker(services.transitionService, logger, concurrency),
  );
  services.workerFactory.create(createOutboxRelayWorker(services.outboxRelay));
  services.workerFactory.create(
    createEventDispatchWorker(services.eventDispatcher, concurrency * 2),
  );
  services.workerFactory.create(
    createNotificationDeliveryWorker(services.notificationDispatcher, concurrency * 2),
  );
  services.workerFactory.create(createDigestSweepWorker(services.digestService));

  await registerRepeatableJobs(services, environment);

  logger.info("SPM background workers started", {
    concurrency,
    schedulerEnabled: environment.SCHEDULER_ENABLED,
    digestEnabled: environment.DIGEST_ENABLED,
    senderMode: environment.NOTIFICATION_SENDER_MODE,
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}. Shutting down workers.`);

    // Workers first, and awaited: in-flight jobs must finish before Prisma
    // disconnects, or every deploy fails a batch of jobs mid-transaction.
    await services.workerFactory.closeAll();
    await services.shutdown();
  }

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

async function registerRepeatableJobs(
  services: ReturnType<typeof createServiceGraph>,
  environment: ReturnType<typeof validateEnvironment>,
): Promise<void> {
  if (environment.SCHEDULER_ENABLED) {
    await services.queueService.registerRepeatable(
      QUEUE_NAMES.schedulerTick,
      JOB_NAMES.schedulerTick,
      environment.SCHEDULER_TICK_INTERVAL_MS,
      REPEATABLE_JOB_IDS.schedulerTick,
    );
  }

  await services.queueService.registerRepeatable(
    QUEUE_NAMES.eventsRelay,
    JOB_NAMES.relayOutbox,
    environment.EVENT_RELAY_INTERVAL_MS,
    REPEATABLE_JOB_IDS.eventsRelay,
  );

  if (environment.DIGEST_ENABLED) {
    await services.queueService.registerRepeatable(
      QUEUE_NAMES.notificationDigest,
      JOB_NAMES.sweepDigests,
      environment.DIGEST_SWEEP_INTERVAL_MS,
      REPEATABLE_JOB_IDS.digestSweep,
    );
  }
}

bootstrap().catch((error: unknown) => {
  console.error("Worker failed to start:", error);
  process.exitCode = 1;
});
