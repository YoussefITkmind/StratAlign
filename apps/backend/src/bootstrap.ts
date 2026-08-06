import type { Environment } from "./config/env.validation";
import { PrismaService } from "./database/prisma.service";
import { RedisService } from "./redis/redis.service";
import { createLogger, type Logger } from "./logging/logger";
import { HealthService } from "./modules/health/health.service";
import { QueueConnectionProvider } from "./queue/queue-connection";
import { QueueService } from "./queue/queue.service";
import { DeadLetterService } from "./queue/dead-letter.service";
import { WorkerFactory } from "./queue/worker.factory";
import { EventBusService } from "./events/event-bus.service";
import { EventSubscriberRegistry } from "./events/event-subscriber.registry";
import { EventDispatcherService } from "./events/event-dispatcher.service";
import { OutboxRelayService } from "./events/outbox-relay.service";
import { CadenceEngine } from "./modules/cadence/cadence.engine";
import { PeriodCalendarEngine } from "./modules/cadence/period-calendar.engine";
import { SchedulerService } from "./modules/scheduler/scheduler.service";
import { CadenceGeneratorService } from "./modules/scheduler/cadence-generator.service";
import { ScheduleTransitionService } from "./modules/scheduler/schedule-transition.service";
import { SchedulerTickService } from "./modules/scheduler/scheduler-tick.service";
import { TemplateRenderer } from "./modules/notifications/template/template.renderer";
import { NotificationTemplateService } from "./modules/notifications/template/template.service";
import { NotificationPreferenceService } from "./modules/notifications/notification.preference.service";
import { NotificationService } from "./modules/notifications/notification.service";
import { NotificationDispatcher } from "./modules/notifications/notification.dispatcher";
import { DigestService } from "./modules/notifications/digest/digest.service";
import { createSenderRegistry, type SenderRegistry } from "./modules/notifications/sender/sender.registry";
import { ScheduleNotificationSubscriber } from "./modules/notifications/subscribers/schedule-notification.subscriber";

export interface ServiceGraph {
  logger: Logger;
  prisma: PrismaService;
  redis: RedisService;
  queueConnectionProvider: QueueConnectionProvider;
  health: HealthService;
  queueService: QueueService;
  deadLetterService: DeadLetterService;
  workerFactory: WorkerFactory;
  eventBus: EventBusService;
  subscriberRegistry: EventSubscriberRegistry;
  eventDispatcher: EventDispatcherService;
  outboxRelay: OutboxRelayService;
  cadenceEngine: CadenceEngine;
  periodCalendarEngine: PeriodCalendarEngine;
  schedulerService: SchedulerService;
  cadenceGenerator: CadenceGeneratorService;
  transitionService: ScheduleTransitionService;
  tickService: SchedulerTickService;
  senderRegistry: SenderRegistry;
  notificationService: NotificationService;
  notificationDispatcher: NotificationDispatcher;
  digestService: DigestService;
  connect(): Promise<void>;
  shutdown(): Promise<void>;
}

/**
 * Composition root.
 *
 * Dependency injection here is what it already was in this codebase: plain
 * constructor injection, wired by hand, no container and no decorators. Both
 * the API process and the worker process build the identical graph, so a
 * service behaves the same wherever it runs.
 */
export function createServiceGraph(environment: Environment): ServiceGraph {
  const logger = createLogger(environment.LOG_LEVEL);

  const prisma = new PrismaService(environment.DATABASE_URL);
  const redis = new RedisService(environment.REDIS_URL);
  const queueConnectionProvider = new QueueConnectionProvider(environment.REDIS_URL);
  const health = new HealthService(prisma, redis);

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

  // ---- events -------------------------------------------------------------

  const subscriberRegistry = new EventSubscriberRegistry();
  const eventBus = new EventBusService(queueService, logger.child("event-bus"));

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

  // ---- scheduler ----------------------------------------------------------

  const cadenceEngine = new CadenceEngine();
  const periodCalendarEngine = new PeriodCalendarEngine();

  const schedulerService = new SchedulerService(
    prisma,
    cadenceEngine,
    {
      defaultTimezone: environment.SCHEDULER_DEFAULT_TIMEZONE,
      defaultLookaheadSeconds: environment.SCHEDULER_LOOKAHEAD_SECONDS,
    },
    logger.child("scheduler"),
  );

  const cadenceGenerator = new CadenceGeneratorService(
    prisma,
    cadenceEngine,
    periodCalendarEngine,
    queueService,
    {
      maxCatchUpOccurrences: environment.SCHEDULER_MAX_CATCHUP_OCCURRENCES,
      tickIntervalMs: environment.SCHEDULER_TICK_INTERVAL_MS,
    },
    logger.child("cadence-generator"),
  );

  const transitionService = new ScheduleTransitionService(
    prisma,
    eventBus,
    queueService,
    logger.child("schedule-transition"),
  );

  const tickService = new SchedulerTickService(
    prisma,
    queueService,
    transitionService,
    {
      lookaheadSeconds: environment.SCHEDULER_LOOKAHEAD_SECONDS,
      batchSize: environment.SCHEDULER_TICK_BATCH_SIZE,
      tickIntervalMs: environment.SCHEDULER_TICK_INTERVAL_MS,
      maxWaitingMaterializeJobs: environment.SCHEDULER_TICK_BATCH_SIZE * 4,
    },
    logger.child("scheduler-tick"),
  );

  // ---- notifications ------------------------------------------------------

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

  const preferenceService = new NotificationPreferenceService(prisma, {
    locale: environment.NOTIFICATION_DEFAULT_LOCALE,
    timezone: environment.SCHEDULER_DEFAULT_TIMEZONE,
    digestIntervalMinutes: 1440,
  });

  const senderRegistry = createSenderRegistry(
    environment,
    logger.child("senders"),
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
    logger.child("digest"),
  );

  // Registered in the composition root rather than inside either module, so
  // the coupling between scheduler events and notifications is visible in one
  // place and easy to remove.
  subscriberRegistry.register(
    new ScheduleNotificationSubscriber(
      notificationService,
      logger.child("schedule-notification-subscriber"),
    ),
  );

  return {
    logger,
    prisma,
    redis,
    queueConnectionProvider,
    health,
    queueService,
    deadLetterService,
    workerFactory,
    eventBus,
    subscriberRegistry,
    eventDispatcher,
    outboxRelay,
    cadenceEngine,
    periodCalendarEngine,
    schedulerService,
    cadenceGenerator,
    transitionService,
    tickService,
    senderRegistry,
    notificationService,
    notificationDispatcher,
    digestService,

    async connect(): Promise<void> {
      await Promise.all([prisma.connect(), redis.connect()]);
    },

    /**
     * Order matters: queues stop accepting work before their connections are
     * torn down, and the database goes last so anything still finishing has a
     * handle to complete against.
     */
    async shutdown(): Promise<void> {
      // Closing the queues closes the connections BullMQ opened for them.
      await queueService.close();
      await Promise.all([prisma.disconnect(), redis.disconnect()]);
    },
  };
}
