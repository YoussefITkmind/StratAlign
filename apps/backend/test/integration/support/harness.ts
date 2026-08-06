import { validateEnvironment, type Environment } from "../../../src/config/env.validation";
import { createServiceGraph, type ServiceGraph } from "../../../src/bootstrap";
import { PrismaService } from "../../../src/database/prisma.service";
import { FakeSender } from "../../../src/modules/notifications/sender/fake.sender";
import { NotificationChannel } from "../../../src/generated/prisma/enums";
import { QUEUE_NAMES } from "../../../src/queue/queue.constants";
import { startTestServices, uniqueQueuePrefix } from "./test-services";

export interface TestHarness {
  services: ServiceGraph;
  environment: Environment;
  prisma: PrismaService;
  /** The fake sender registered for EMAIL, for asserting on the delivery log. */
  emailSender: FakeSender;
  senderFor(channel: NotificationChannel): FakeSender;
  reset(): Promise<void>;
  teardown(): Promise<void>;
}

export interface HarnessOptions {
  /** Distinguishes this file's BullMQ keyspace from every other spec's. */
  label: string;
  overrides?: Record<string, string>;
}

/**
 * Builds a real service graph against real Postgres and Redis.
 *
 * The graph is the same one `main.ts` and `worker.ts` construct — integration
 * tests exercise production wiring rather than a bespoke test assembly, so a
 * bootstrap mistake fails here instead of in production.
 */
export async function createTestHarness(
  options: HarnessOptions,
): Promise<TestHarness> {
  const urls = await startTestServices();

  const environment = validateEnvironment({
    NODE_ENV: "test",
    DATABASE_URL: urls.databaseUrl,
    REDIS_URL: urls.redisUrl,
    LOG_LEVEL: "error",
    QUEUE_PREFIX: uniqueQueuePrefix(options.label),
    // Senders stay fake: integration tests assert on the delivery log, never
    // on a real provider.
    NOTIFICATION_SENDER_MODE: "fake",
    ...options.overrides,
  });

  const services = createServiceGraph(environment);

  await services.connect();

  const senderFor = (channel: NotificationChannel): FakeSender => {
    const sender = services.senderRegistry.get(channel);

    if (!(sender instanceof FakeSender)) {
      throw new Error(`Expected a FakeSender for ${channel} in tests`);
    }

    return sender;
  };

  return {
    services,
    environment,
    prisma: services.prisma,
    emailSender: senderFor(NotificationChannel.EMAIL),
    senderFor,

    /**
     * Returns the harness to a clean state between tests.
     *
     * Workers are closed and queues obliterated, not merely drained: a worker
     * left running from a previous test would keep consuming, and a leftover
     * job would be attributed to whichever test happened to register a worker
     * for that queue next.
     */
    async reset(): Promise<void> {
      await services.workerFactory.closeAll();

      for (const queueName of Object.values(QUEUE_NAMES)) {
        await services.queueService
          .getQueue(queueName)
          .obliterate({ force: true });
      }

      await truncateAll(services.prisma);

      for (const channel of Object.values(NotificationChannel)) {
        senderFor(channel).clear();
      }
    },

    async teardown(): Promise<void> {
      await services.workerFactory.closeAll();
      await services.shutdown();
    },
  };
}

/**
 * Every Track C table, in one TRUNCATE so foreign keys never order the wipe.
 * `system_settings` is deliberately absent: it is seeded platform state rather
 * than test data. Templates are included, so each test seeds exactly the
 * templates it depends on and no spec inherits another's content.
 */
const TEST_OWNED_TABLES = [
  "notification_deliveries",
  "notification_digests",
  "notification_preferences",
  "notification_templates",
  "domain_events",
  "cadence_instances",
  "cadence_definitions",
  "period_calendars",
] as const;

export async function truncateAll(prisma: PrismaService): Promise<void> {
  const tables = TEST_OWNED_TABLES.map((table) => `"${table}"`).join(", ");

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`,
  );
}

/**
 * Polls until `condition` holds. Integration tests must observe asynchronous
 * workers, but they must never sleep for a fixed duration — this returns the
 * moment the condition is met and fails fast if it never is.
 */
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
      throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${description}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
