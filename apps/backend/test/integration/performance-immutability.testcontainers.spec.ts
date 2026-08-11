import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaService } from "../../src/database/prisma.service";
import { PerformanceService } from "../../src/modules/performance";
import { EventBusService } from "../../src/events/event-bus.service";
import { QueueService } from "../../src/queue/queue.service";
import { QueueConnectionProvider } from "../../src/queue/queue-connection";
import { createLogger } from "../../src/logging/logger";

import { startTestServices } from "./support/test-services";

describe.sequential(
  "Performance immutability enforcement with Testcontainers",
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
          .withDatabase("performance_test")
          .withUsername("perf_test")
          .withPassword("perf_test_password")
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
          email: "test@example.com",
          displayName: "Test User",
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
          nameEn: "Test KPI",
          nameAr: "KPI اختبار",
          unit: "%",
          polarity: "HIGHER_IS_BETTER",
          frequency: "MONTHLY",
          dataSourceType: "MANUAL",
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

    it("Postgres-level immutability: UPDATE fails at DB level", async () => {
      // Create a measurement
      const measurement = await performance.createMeasurement({
        kpiVersionId,
        scopeNodeId: "scope-1",
        period: "2026-01",
        value: 85.5,
        source: "MANUAL",
        submittedBy: userId,
      });

      // Attempt to update the measurement directly via Prisma
      // This should fail due to the database trigger
      await expect(
        prisma.measurement.update({
          where: { id: measurement.id },
          data: { value: 90.0 },
        }),
      ).rejects.toThrow();
    });

    it("Postgres-level immutability: DELETE fails at DB level", async () => {
      // Create a measurement
      const measurement = await performance.createMeasurement({
        kpiVersionId,
        scopeNodeId: "scope-2",
        period: "2026-02",
        value: 75.0,
        source: "MANUAL",
        submittedBy: userId,
      });

      // Attempt to delete the measurement directly via Prisma
      // This should fail due to the database trigger
      await expect(
        prisma.measurement.delete({
          where: { id: measurement.id },
        }),
      ).rejects.toThrow();
    });

    it("Supersession chain correctness", async () => {
      // Create initial measurement
      const v1 = await performance.createMeasurement({
        kpiVersionId,
        scopeNodeId: "scope-3",
        period: "2026-03",
        value: 80.0,
        source: "MANUAL",
        submittedBy: userId,
      });

      // Create correction that supersedes v1
      const v2 = await performance.createMeasurement({
        kpiVersionId,
        scopeNodeId: "scope-3",
        period: "2026-03",
        value: 85.0,
        source: "MANUAL",
        supersedesId: v1.id,
        submittedBy: userId,
      });

      // Create another correction that supersedes v2
      const v3 = await performance.createMeasurement({
        kpiVersionId,
        scopeNodeId: "scope-3",
        period: "2026-03",
        value: 82.5,
        source: "MANUAL",
        supersedesId: v2.id,
        submittedBy: userId,
      });

      // Verify supersession chain
      expect(v1.supersedesId).toBeNull();
      expect(v2.supersedesId).toBe(v1.id);
      expect(v3.supersedesId).toBe(v2.id);

      // Verify current measurement is v3 (no measurements supersede it)
      const current = await performance.getCurrentMeasurement(
        kpiVersionId,
        "scope-3",
        "2026-03",
      );
      expect(current?.id).toBe(v3.id);
      expect(current?.value).toBe(82.5);
    });

    it("Point-in-time 'asOf' resolution across correction chain", async () => {
      const now = new Date();
      const t1 = new Date(now.getTime() - 3000); // 3 seconds ago
      const t2 = new Date(now.getTime() - 2000); // 2 seconds ago
      const t3 = new Date(now.getTime() - 1000); // 1 second ago

      // Create measurements with specific timestamps
      const v1 = await prisma.measurement.create({
        data: {
          kpiVersionId,
          scopeNodeId: "scope-4",
          period: "2026-04",
          value: 70.0,
          source: "MANUAL",
          createdAt: t1,
        },
      });

      const v2 = await prisma.measurement.create({
        data: {
          kpiVersionId,
          scopeNodeId: "scope-4",
          period: "2026-04",
          value: 75.0,
          source: "MANUAL",
          supersedesId: v1.id,
          createdAt: t2,
        },
      });

      const v3 = await prisma.measurement.create({
        data: {
          kpiVersionId,
          scopeNodeId: "scope-4",
          period: "2026-04",
          value: 78.0,
          source: "MANUAL",
          supersedesId: v2.id,
          createdAt: t3,
        },
      });

      // Query asOf before v2 was created
      const asOfT1 = await performance.getMeasurementAsOf(
        kpiVersionId,
        "scope-4",
        "2026-04",
        new Date(t1.getTime() + 500),
      );
      expect(asOfT1?.id).toBe(v1.id);
      expect(asOfT1?.value).toBe(70.0);

      // Query asOf after v2 but before v3
      const asOfT2 = await performance.getMeasurementAsOf(
        kpiVersionId,
        "scope-4",
        "2026-04",
        new Date(t2.getTime() + 500),
      );
      expect(asOfT2?.id).toBe(v2.id);
      expect(asOfT2?.value).toBe(75.0);

      // Query asOf after v3
      const asOfT3 = await performance.getMeasurementAsOf(
        kpiVersionId,
        "scope-4",
        "2026-04",
        new Date(t3.getTime() + 500),
      );
      expect(asOfT3?.id).toBe(v3.id);
      expect(asOfT3?.value).toBe(78.0);
    });
  },
);
