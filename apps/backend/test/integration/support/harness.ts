import {
  validateEnvironment,
  type Environment,
} from "../../../src/config/env.validation";
import { PrismaService } from "../../../src/database/prisma.service";
import { createLogger } from "../../../src/logging/logger";

import { QueueConnectionProvider } from "../../../src/queue/queue-connection";
import { QueueService } from "../../../src/queue/queue.service";
import { DeadLetterService } from "../../../src/queue/dead-letter.service";
import { WorkerFactory } from "../../../src/queue/worker.factory";
import { QUEUE_NAMES } from "../../../src/queue/queue.constants";

import { EventSubscriberRegistry } from "../../../src/events/event-subscriber.registry";
import { EventBusService } from "../../../src/events/event-bus.service";
import { EventDispatcherService } from "../../../src/events/event-dispatcher.service";
import { OutboxRelayService } from "../../../src/events/outbox-relay.service";

import { CadenceEngine } from "../../../src/modules/cadence/cadence.engine";
import { PeriodCalendarEngine } from "../../../src/modules/cadence/period-calendar.engine";
import { SchedulerService } from "../../../src/modules/scheduler/scheduler.service";
import { CadenceGeneratorService } from "../../../src/modules/scheduler/cadence-generator.service";
import { ScheduleTransitionService } from "../../../src/modules/scheduler/schedule-transition.service";
import { SchedulerTickService } from "../../../src/modules/scheduler/scheduler-tick.service";

import { TemplateRenderer } from "../../../src/modules/notifications/template/template.renderer";
import { NotificationTemplateService } from "../../../src/modules/notifications/template/template.service";
import { NotificationPreferenceService } from "../../../src/modules/notifications/notification.preference.service";
import { NotificationService } from "../../../src/modules/notifications/notification.service";
import { NotificationDispatcher } from "../../../src/modules/notifications/notification.dispatcher";
import { DigestService } from "../../../src/modules/notifications/digest/digest.service";
import {
  createSenderRegistry,
  type SenderRegistry,
} from "../../../src/modules/notifications/sender/sender.registry";
import { FakeSender } from "../../../src/modules/notifications/sender/fake.sender";
import { ScheduleNotificationSubscriber } from "../../../src/modules/notifications/subscribers/schedule-notification.subscriber";

import { NotificationChannel } from "../../../src/generated/prisma/enums";
import {
  startTestServices,
  uniqueQueuePrefix,
} from "./test-services";

export interface TestServiceGraph {
  prisma: PrismaService;
  queueService: QueueService;
  deadLetterService: DeadLetterService;
  workerFactory: WorkerFactory;
  schedulerService: SchedulerService;
  cadenceGenerator: CadenceGeneratorService;
  transitionService: ScheduleTransitionService;
  tickService: SchedulerTickService;
  notificationService: NotificationService;
  notificationDispatcher: NotificationDispatcher;
  digestService: DigestService;
  senderRegistry: SenderRegistry;
  eventDispatcher: EventDispatcherService;
  outboxRelay: OutboxRelayService;
  logger: ReturnType<typeof createLogger>;
}

export interface TestHarness {
  services: TestServiceGraph;
  environment: Environment;
  prisma: PrismaService;
  emailSender: FakeSender;
  senderFor(channel: NotificationChannel): FakeSender;
  reset(): Promise<void>;
  teardown(): Promise<void>;
}

export interface HarnessOptions {
  label: string;
  overrides?: Record<string, string>;
}

export async function createTestHarness(
  options: HarnessOptions,
): Promise<TestHarness> {
  const urls = await startTestServices();

  const environment = validateEnvironment({
    NODE_ENV: "test",
    FRONTEND_URL: "http://localhost:3000",
    DATABASE_URL: urls.databaseUrl,
    REDIS_URL: urls.redisUrl,
    LOG_LEVEL: "error",
    QUEUE_PREFIX: uniqueQueuePrefix(options.label),

    AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
    AUTH_OIDC_ISSUER: "http://localhost:9999",
    AUTH_OIDC_CLIENT_ID: "test-client",
    AUTH_OIDC_JWKS_URI: "http://localhost:9999/jwks",

    NOTIFICATION_SENDER_MODE: "fake",

    ...options.overrides,
  });

  const logger = createLogger(environment.LOG_LEVEL);

  const prisma = new PrismaService(environment.DATABASE_URL);

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

  const templateRenderer = new TemplateRenderer();

  const templateService = new NotificationTemplateService(
    prisma,
    templateRenderer,
    {
      defaultLocale: "en",
      fallbackLocale: "en",
    },
    logger.child("notification-template"),
  );

  const preferenceService = new NotificationPreferenceService(
    prisma,
    {
      locale: "en",
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
    logger.child("digest"),
  );

  const subscriberRegistry = new EventSubscriberRegistry();

  subscriberRegistry.register(
    new ScheduleNotificationSubscriber(
      notificationService,
      logger.child("schedule-notification"),
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

  await prisma.connect();

  const services: TestServiceGraph = {
    prisma,
    queueService,
    deadLetterService,
    workerFactory,
    schedulerService,
    cadenceGenerator,
    transitionService,
    tickService,
    notificationService,
    notificationDispatcher,
    digestService,
    senderRegistry,
    eventDispatcher,
    outboxRelay,
    logger,
  };

  const senderFor = (
    channel: NotificationChannel,
  ): FakeSender => {
    const sender = senderRegistry.get(channel);

    if (!(sender instanceof FakeSender)) {
      throw new Error(
        `Expected a FakeSender for ${channel} in tests`,
      );
    }

    return sender;
  };

  return {
    services,
    environment,
    prisma,
    emailSender: senderFor(NotificationChannel.EMAIL),
    senderFor,

    async reset(): Promise<void> {
      await workerFactory.closeAll();

      for (const queueName of Object.values(QUEUE_NAMES)) {
        await queueService
          .getQueue(queueName)
          .obliterate({ force: true });
      }

      await truncateAll(prisma);

      for (const channel of Object.values(NotificationChannel)) {
        senderFor(channel).clear();
      }
    },

    async teardown(): Promise<void> {
      await workerFactory.closeAll();
      await queueService.close();
      await prisma.disconnect();
    },
  };
}

const TEST_OWNED_TABLES = [
  '"public"."notification_deliveries"',
  '"public"."notification_digests"',
  '"public"."notification_preferences"',
  '"public"."notification_templates"',
  '"public"."domain_events"',
  '"scheduling"."cadence_instances"',
  '"scheduling"."cadence_definitions"',
  '"scheduling"."period_calendars"',
  '"iam"."users"',
] as const;

export async function truncateAll(
  prisma: PrismaService,
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TEST_OWNED_TABLES.join(", ")} RESTART IDENTITY CASCADE`,
  );
}

export async function waitFor<T>(
  description: string,
  condition: () => Promise<T | null | undefined | false>,
  timeoutMs = 10_000,
  pollIntervalMs = 25,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const result = await condition();

    if (result) {
      return result;
    }

    if (Date.now() > deadline) {
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for: ${description}`,
      );
    }

    await new Promise((resolve) =>
      setTimeout(resolve, pollIntervalMs),
    );
  }
}
