import "dotenv/config";

import { validateEnvironment } from "./config/env.validation";
import { PrismaService } from "./database/prisma.service";
import { RedisService } from "./redis/redis.service";
import { createLogger } from "./logging/logger";
import { QueueConnectionProvider } from "./queue/queue-connection";
import { QueueService } from "./queue/queue.service";
import { DeadLetterService } from "./queue/dead-letter.service";
import { WorkerFactory } from "./queue/worker.factory";
import {
  JOB_NAMES,
  QUEUE_NAMES,
  REPEATABLE_JOB_IDS,
} from "./queue/queue.constants";
import { EventSubscriberRegistry } from "./events/event-subscriber.registry";
import { EventDispatcherService } from "./events/event-dispatcher.service";
import { OutboxRelayService } from "./events/outbox-relay.service";
import { JournalService } from "./modules/audit/journal.service";
import { AuditEventSubscriber } from "./modules/audit/audit-event.subscriber";
import { StubSiemForwarder } from "./modules/audit/siem-forwarder";
import {
  createEventDispatchWorker,
  createOutboxRelayWorker,
} from "./workers/event.workers";
import { createAuditVerificationWorker } from "./workers/audit.workers";

async function bootstrap(): Promise<void> {
  const environment = validateEnvironment(process.env);
  const logger = createLogger(environment.LOG_LEVEL);

  const prisma = new PrismaService(environment.DATABASE_URL);
  const redis = new RedisService(environment.REDIS_URL);
  const queueConnectionProvider =
    new QueueConnectionProvider(environment.REDIS_URL);

  const queueService = new QueueService(
    queueConnectionProvider,
    environment.QUEUE_PREFIX,
    logger.child("queue"),
  );

  const deadLetterService = new DeadLetterService(
    queueService,
    logger.child("dead-letter"),
  );

  const workerFactory = new WorkerFactory(
    queueConnectionProvider,
    environment.QUEUE_PREFIX,
    deadLetterService,
    logger,
  );

  const subscriberRegistry = new EventSubscriberRegistry();

  const journal = new JournalService(prisma);

  const siemForwarder = new StubSiemForwarder(
    logger.child("siem"),
  );

  subscriberRegistry.register(
    new AuditEventSubscriber(
      journal,
      siemForwarder,
      logger.child("audit-journal"),
    ),
  );

  const eventDispatcher = new EventDispatcherService(
    subscriberRegistry,
    logger.child("event-dispatcher"),
  );

  const outboxRelay = new OutboxRelayService(
    prisma,
    queueService,
    subscriberRegistry,
    environment.EVENT_RELAY_BATCH_SIZE,
    logger.child("outbox-relay"),
  );

  await Promise.all([
    prisma.connect(),
    redis.connect(),
  ]);

  workerFactory.create(
    createAuditVerificationWorker(
      journal,
      logger.child("audit-verification"),
    ),
  );

  workerFactory.create(
    createOutboxRelayWorker(outboxRelay),
  );

  workerFactory.create(
    createEventDispatchWorker(eventDispatcher, 4),
  );

  await queueService.registerRepeatable(
    QUEUE_NAMES.eventsRelay,
    JOB_NAMES.relayOutbox,
    environment.EVENT_RELAY_INTERVAL_MS,
    REPEATABLE_JOB_IDS.eventsRelay,
  );

  logger.info("SPM event worker started");

  async function shutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}. Shutting down worker.`);

    await workerFactory.closeAll();
    await queueService.close();

    await Promise.all([
      prisma.disconnect(),
      redis.disconnect(),
    ]);
  }

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

bootstrap().catch((error: unknown) => {
  console.error("Worker failed to start:", error);
  process.exitCode = 1;
});
