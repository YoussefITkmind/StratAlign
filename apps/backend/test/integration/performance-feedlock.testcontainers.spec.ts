import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaService } from "../../src/database/prisma.service";
import { PerformanceService } from "../../src/modules/performance";
import { FeedLockError } from "../../src/modules/performance/performance.errors";
import { EventBusService } from "../../src/events/event-bus.service";
import { QueueService } from "../../src/queue/queue.service";
import { QueueConnectionProvider } from "../../src/queue/queue-connection";
import { createLogger } from "../../src/logging/logger";

import { startTestServices } from "./support/test-services";

describe.sequential(
  "Performance feed-lock enforcement with Testcontainers",
  () => {
    let container: Awaited<ReturnType<PostgreSqlContainer["start"]>> | undefined;
    let prisma: PrismaService;
    let performance: PerformanceService;
    let userId: string;
    let kpiVersionId: string;

    beforeAll(async () => {
      let databaseUrl: string;
      try {
        container = await new PostgreSqlContainer("postgres:17-alpine")
          .withDatabase("feedlock_test")
          .withUsername("feedlock_test")
          .withPassword("feedlock_test_password")
          .start();
        databaseUrl = container.getConnectionUri();
      } catch (err) {
        const services = await startTestServices();
        databaseUrl = services.databaseUrl;
      }

      execFileSync(
        "pnpm",
        ["exec", "prisma", "migrate", "deploy"],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            NODE_ENV: "test",
            DATABASE_URL: databaseUrl,
          },
          stdio: "inherit",
        },
      );

      prisma = new PrismaService(databaseUrl);
      await prisma.connect();

      const logger = createLogger("error");
      const queueConnectionProvider = new QueueConnectionProvider(
        "redis://localhost:6379",
      );
      const queueService = new QueueService(
        queueConnectionProvider,
        "test",
        logger.child("queue"),
      );
      const eventBus = new EventBusService(
        queueService,
        logger.child("event-bus"),
      );

      performance = new PerformanceService(prisma, eventBus);

      // Create test user
      const user = await prisma.user.create({
        data: {
          email: "feedlock@example.com",
          displayName: "Feed Lock Test User",
        },
      });
      userId = user.id;

      // Create test KPI version
      const kpiDefinition = await prisma.kpiDefinition.create({
        data: {
          status: "ACTIVE",
        },
      });

      const kpiVersion = await prisma.kpiVersion.create({
        data: {
          kpiDefinitionId: kpiDefinition.id,
          version: 1,
          nameEn: "Feed Lock Test KPI",
          nameAr: "KPI اختبار قفل التغذية",
          unit: "%",
          polarity: "HIGHER_IS_BETTER",
          frequency: "MONTHLY",
          dataSourceType: "FEED",
          ownerUserId: userId,
          activeFrom: new Date(),
        },
      });
      kpiVersionId = kpiVersion.id;
    }, 120_000);

    afterAll(async () => {
      await prisma?.disconnect();
      await container?.stop();
    }, 60_000);

    it("feed-locked measurement rejects manual write attempt", async () => {
      // Create a locked feed measurement
      const feedMeasurement = await performance.createMeasurement({
        kpiVersionId,
        scopeNodeId: "scope-1",
        period: "2026-01",
        value: 85.0,
        source: "FEED",
        locked: true,
        submittedBy: userId,
      });

      // Attempt to manually overwrite the locked feed measurement
      await expect(
        performance.createMeasurement({
          kpiVersionId,
          scopeNodeId: "scope-1",
          period: "2026-01",
          value: 90.0,
          source: "MANUAL",
          supersedesId: feedMeasurement.id,
          submittedBy: userId,
        }),
      ).rejects.toThrow(FeedLockError);
    });

    it("unlocked feed measurement allows manual overwrite", async () => {
      // Create an unlocked feed measurement
      const feedMeasurement = await performance.createMeasurement({
        kpiVersionId,
        scopeNodeId: "scope-2",
        period: "2026-02",
        value: 75.0,
        source: "FEED",
        locked: false,
        submittedBy: userId,
      });

      // Attempt to manually overwrite the unlocked feed measurement
      const manualOverride = await performance.createMeasurement({
        kpiVersionId,
        scopeNodeId: "scope-2",
        period: "2026-02",
        value: 80.0,
        source: "MANUAL",
        supersedesId: feedMeasurement.id,
        submittedBy: userId,
      });

      expect(manualOverride.supersedesId).toBe(feedMeasurement.id);
      expect(manualOverride.value).toBe(80.0);
    });

    it("manual measurement can be superseded by another manual measurement", async () => {
      // Create a manual measurement
      const manualMeasurement = await performance.createMeasurement({
        kpiVersionId,
        scopeNodeId: "scope-3",
        period: "2026-03",
        value: 70.0,
        source: "MANUAL",
        locked: true,
        submittedBy: userId,
      });

      // Manual measurement can be superseded by another manual measurement
      const manualOverride = await performance.createMeasurement({
        kpiVersionId,
        scopeNodeId: "scope-3",
        period: "2026-03",
        value: 75.0,
        source: "MANUAL",
        supersedesId: manualMeasurement.id,
        submittedBy: userId,
      });

      expect(manualOverride.supersedesId).toBe(manualMeasurement.id);
      expect(manualOverride.value).toBe(75.0);
    });

    it("template measurement allows manual overwrite", async () => {
      // Create a template measurement
      const templateMeasurement = await performance.createMeasurement({
        kpiVersionId,
        scopeNodeId: "scope-4",
        period: "2026-04",
        value: 65.0,
        source: "TEMPLATE",
        locked: true,
        submittedBy: userId,
      });

      // Template measurements can be manually overwritten
      const manualOverride = await performance.createMeasurement({
        kpiVersionId,
        scopeNodeId: "scope-4",
        period: "2026-04",
        value: 70.0,
        source: "MANUAL",
        supersedesId: templateMeasurement.id,
        submittedBy: userId,
      });

      expect(manualOverride.supersedesId).toBe(templateMeasurement.id);
      expect(manualOverride.value).toBe(70.0);
    });

    it("feed measurement not targeting a specific measurement succeeds", async () => {
      // Create a manual measurement without superseding anything
      const newMeasurement = await performance.createMeasurement({
        kpiVersionId,
        scopeNodeId: "scope-5",
        period: "2026-05",
        value: 80.0,
        source: "MANUAL",
        submittedBy: userId,
      });

      expect(newMeasurement.supersedesId).toBeNull();
      expect(newMeasurement.value).toBe(80.0);
    });
  },
);
