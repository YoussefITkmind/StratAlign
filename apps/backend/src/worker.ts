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
import { EventBusService } from "./events/event-bus.service";

import { JournalService } from "./modules/audit/journal.service";
import { AuditEventSubscriber } from "./modules/audit/audit-event.subscriber";
import { StubSiemForwarder } from "./modules/audit/siem-forwarder";

import { CadenceEngine } from "./modules/cadence/cadence.engine";
import { PeriodCalendarEngine } from "./modules/cadence/period-calendar.engine";
import { CadenceGeneratorService } from "./modules/scheduler/cadence-generator.service";
import { ScheduleTransitionService } from "./modules/scheduler/schedule-transition.service";
import { SchedulerTickService } from "./modules/scheduler/scheduler-tick.service";

import { TemplateRenderer } from "./modules/notifications/template/template.renderer";
import { NotificationTemplateService } from "./modules/notifications/template/template.service";
import { NotificationPreferenceService } from "./modules/notifications/notification.preference.service";
import { NotificationService } from "./modules/notifications/notification.service";
import { NotificationDispatcher } from "./modules/notifications/notification.dispatcher";
import { DigestService } from "./modules/notifications/digest/digest.service";
import { createSenderRegistry } from "./modules/notifications/sender/sender.registry";
import { ScheduleNotificationSubscriber } from "./modules/notifications/subscribers/schedule-notification.subscriber";

import {
  createEventDispatchWorker,
  createOutboxRelayWorker,
} from "./workers/event.workers";
import { createAuditVerificationWorker } from "./workers/audit.workers";
import {
  createMaterializeWorker,
  createSchedulerTickWorker,
  createTransitionWorker,
} from "./workers/scheduler.workers";
import {
  createDigestSweepWorker,
  createNotificationDeliveryWorker,
} from "./workers/notification.workers";

async function bootstrap(): Promise<void> {
  const environment = validateEnvironment(process.env);
  const logger = createLogger(environment.LOG_LEVEL);

  const prisma = new PrismaService(environment.DATABASE_URL);
  const redis = new RedisService(environment.REDIS_URL);

  const queueConnectionProvider = new QueueConnectionProvider(
    environment.REDIS_URL,
  );

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

  const eventBus = new EventBusService(
    queueService,
    logger.child("event-bus"),
  );

  const subscriberRegistry = new EventSubscriberRegistry();

  // ---------------------------------------------------------------------------
  // Audit
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Scheduler
  // ---------------------------------------------------------------------------

  const cadenceEngine = new CadenceEngine();
  const periodCalendarEngine = new PeriodCalendarEngine();

  const transitionService = new ScheduleTransitionService(
    prisma,
    eventBus,
    queueService,
    logger.child("scheduler-transition"),
  );

  const cadenceGenerator = new CadenceGeneratorService(
    prisma,
    cadenceEngine,
    periodCalendarEngine,
    queueService,
    {
      maxCatchUpOccurrences:
        environment.SCHEDULER_MAX_CATCHUP_OCCURRENCES,
      tickIntervalMs:
        environment.SCHEDULER_TICK_INTERVAL_MS,
    },
    logger.child("cadence-generator"),
  );

  const tickService = new SchedulerTickService(
    prisma,
    queueService,
    transitionService,
    {
      lookaheadSeconds:
        environment.SCHEDULER_LOOKAHEAD_SECONDS,
      batchSize:
        environment.SCHEDULER_TICK_BATCH_SIZE,
      tickIntervalMs:
        environment.SCHEDULER_TICK_INTERVAL_MS,
      maxWaitingMaterializeJobs:
        environment.SCHEDULER_TICK_BATCH_SIZE * 4,
    },
    logger.child("scheduler-tick"),
  );

  // ---------------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------------

  const templateRenderer = new TemplateRenderer();

  const templateService = new NotificationTemplateService(
    prisma,
    templateRenderer,
    {
      defaultLocale: environment.NOTIFICATION_DEFAULT_LOCALE,
      fallbackLocale: environment.NOTIFICATION_FALLBACK_LOCALE,
    },
    logger.child("notification-template"),
  );

  const preferenceService = new NotificationPreferenceService(
    prisma,
    {
      locale: environment.NOTIFICATION_DEFAULT_LOCALE,
      timezone: environment.SCHEDULER_DEFAULT_TIMEZONE,
      digestIntervalMinutes: 1440,
    },
  );

  const senderRegistry = createSenderRegistry(
    environment,
    logger.child("notification-senders"),
  );

  const notificationService = new NotificationService(
    prisma,
    preferenceService,
    templateService,
    queueService,
    {
      enabled: environment.NOTIFICATION_ENABLED,
      maxAttempts: environment.NOTIFICATION_MAX_ATTEMPTS,
    },
    logger.child("notification"),
  );

  const notificationDispatcher = new NotificationDispatcher(
    prisma,
    senderRegistry,
    logger.child("notification-dispatcher"),
  );

  const digestService = new DigestService(
    prisma,
    preferenceService,
    templateService,
    queueService,
    {
      enabled: environment.DIGEST_ENABLED,
      maxItems: environment.DIGEST_MAX_ITEMS,
      maxAttempts: environment.NOTIFICATION_MAX_ATTEMPTS,
    },
    logger.child("notification-digest"),
  );

  subscriberRegistry.register(
    new ScheduleNotificationSubscriber(
      notificationService,
      logger.child("schedule-notifications"),
    ),
  );

  // ---------------------------------------------------------------------------
  // Event/outbox infrastructure
  // ---------------------------------------------------------------------------

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

  const concurrency = environment.WORKER_CONCURRENCY;

  // ---------------------------------------------------------------------------
  // Workers
  // ---------------------------------------------------------------------------

  workerFactory.create(
    createAuditVerificationWorker(
      journal,
      logger.child("audit-verification"),
    ),
  );

  workerFactory.create(
    createSchedulerTickWorker(tickService),
  );

  workerFactory.create(
    createMaterializeWorker(
      cadenceGenerator,
      concurrency,
    ),
  );

  workerFactory.create(
    createTransitionWorker(
      transitionService,
      logger.child("scheduler-transition-worker"),
      concurrency,
    ),
  );

  workerFactory.create(
    createOutboxRelayWorker(outboxRelay),
  );

  workerFactory.create(
    createEventDispatchWorker(
      eventDispatcher,
      concurrency * 2,
    ),
  );

  workerFactory.create(
    createNotificationDeliveryWorker(
      notificationDispatcher,
      concurrency * 2,
    ),
  );

  workerFactory.create(
    createDigestSweepWorker(digestService),
  );

  // ---------------------------------------------------------------------------
  // Repeatable jobs
  // ---------------------------------------------------------------------------

  if (environment.SCHEDULER_ENABLED) {
    await queueService.registerRepeatable(
      QUEUE_NAMES.schedulerTick,
      JOB_NAMES.schedulerTick,
      environment.SCHEDULER_TICK_INTERVAL_MS,
      REPEATABLE_JOB_IDS.schedulerTick,
    );
  }

  await queueService.registerRepeatable(
    QUEUE_NAMES.eventsRelay,
    JOB_NAMES.relayOutbox,
    environment.EVENT_RELAY_INTERVAL_MS,
    REPEATABLE_JOB_IDS.eventsRelay,
  );

  if (environment.DIGEST_ENABLED) {
    await queueService.registerRepeatable(
      QUEUE_NAMES.notificationDigest,
      JOB_NAMES.sweepDigests,
      environment.DIGEST_SWEEP_INTERVAL_MS,
      REPEATABLE_JOB_IDS.digestSweep,
    );
  }

  logger.info(
    "SPM audit, scheduler, event and notification workers started",
  );

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
