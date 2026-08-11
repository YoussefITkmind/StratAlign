import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaService } from "../../src/database/prisma.service";
import { PerformanceService } from "../../src/modules/performance";
import { PerformanceRecomputeSubscriber } from "../../src/modules/performance/recompute.worker";
import { RulesService } from "../../src/modules/rules/rules.service";
import { EventBusService } from "../../src/events/event-bus.service";
import { QueueService } from "../../src/queue/queue.service";
import { QueueConnectionProvider } from "../../src/queue/queue-connection";
import { createLogger } from "../../src/logging/logger";
import type { DomainEventEnvelope } from "../../src/events/event.types";

import { startTestServices } from "./support/test-services";

describe.sequential(
  "Performance recompute correctness with golden fixtures",
  () => {
    let container: Awaited<ReturnType<PostgreSqlContainer["start"]>> | undefined;
    let prisma: PrismaService;
    let performance: PerformanceService;
    let rules: RulesService;
    let recomputeSubscriber: PerformanceRecomputeSubscriber;
    let userId: string;
    let kpiVersionId: string;
    let thresholdRuleId: string;

    // Golden fixture: higher_is_better threshold rule
    const goldenThresholdRule = {
      ruleType: "threshold_status" as const,
      direction: "higher_is_better" as const,
      bands: [
        { label: "on_track", color: "green", comparator: "gte" as const, value: 80 },
        { label: "at_risk", color: "amber", comparator: "gte" as const, value: 60 },
        { label: "off_track", color: "red", comparator: "lt" as const, value: 60 },
      ],
    };

    beforeAll(async () => {
      let databaseUrl: string;
      try {
        container = await new PostgreSqlContainer("postgres:17-alpine")
          .withDatabase("recompute_test")
          .withUsername("recompute_test")
          .withPassword("recompute_test_password")
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
      rules = new RulesService(prisma);
      recomputeSubscriber = new PerformanceRecomputeSubscriber(
        prisma,
        rules,
        eventBus,
        logger,
      );

      // Create test user
      const user = await prisma.user.create({
        data: {
          email: "recompute@example.com",
          displayName: "Recompute Test User",
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
          nameEn: "Recompute Test KPI",
          nameAr: "KPI اختبار إعادة الحساب",
          unit: "%",
          polarity: "HIGHER_IS_BETTER",
          frequency: "MONTHLY",
          dataSourceType: "MANUAL",
          ownerUserId: userId,
          activeFrom: new Date(),
        },
      });
      kpiVersionId = kpiVersion.id;

      // Create and publish threshold rule (golden fixture)
      const ruleDraft = await rules.createDraft({
        ruleKey: `kpi-${kpiDefinition.id}-threshold`,
        name: "Test Threshold Rule",
        createdBy: userId,
        document: goldenThresholdRule,
      });

      const publishedRule = await rules.publish(ruleDraft.id);
      thresholdRuleId = publishedRule.id;
    }, 120_000);

    afterAll(async () => {
      await prisma?.disconnect();
      await container?.stop();
    }, 60_000);

    it("recompute worker produces correct StatusResult given golden fixture rules", async () => {
      // Create measurement with value 90 (should be on_track)
      const measurement1 = await performance.createMeasurement({
        kpiVersionId,
        scopeNodeId: "scope-1",
        period: "2026-01",
        value: 90.0,
        source: "MANUAL",
        submittedBy: userId,
      });

      // Simulate measurement recorded event
      const envelope: DomainEventEnvelope = {
        eventId: "evt-1",
        eventType: "performance.measurement.recorded",
        eventVersion: 1,
        aggregateType: "measurement",
        aggregateId: measurement1.id,
        occurredAt: new Date().toISOString(),
        payload: {
          measurementId: measurement1.id,
          kpiVersionId,
          scopeNodeId: "scope-1",
          period: "2026-01",
          value: 90.0,
          source: "MANUAL",
          supersedesId: null,
        },
      };

      await recomputeSubscriber.handle(envelope);

      // Verify status result
      const status1 = await performance.getStatusResult(
        kpiVersionId,
        "scope-1",
        "2026-01",
      );
      expect(status1).not.toBeNull();
      expect(status1?.status).toBe("on_track");
      expect(status1?.ruleVersionUsed).toBe(thresholdRuleId);

      // Create measurement with value 70 (should be at_risk)
      const measurement2 = await performance.createMeasurement({
        kpiVersionId,
        scopeNodeId: "scope-2",
        period: "2026-02",
        value: 70.0,
        source: "MANUAL",
        submittedBy: userId,
      });

      const envelope2: DomainEventEnvelope = {
        eventId: "evt-2",
        eventType: "performance.measurement.recorded",
        eventVersion: 1,
        aggregateType: "measurement",
        aggregateId: measurement2.id,
        occurredAt: new Date().toISOString(),
        payload: {
          measurementId: measurement2.id,
          kpiVersionId,
          scopeNodeId: "scope-2",
          period: "2026-02",
          value: 70.0,
          source: "MANUAL",
          supersedesId: null,
        },
      };

      await recomputeSubscriber.handle(envelope2);

      const status2 = await performance.getStatusResult(
        kpiVersionId,
        "scope-2",
        "2026-02",
      );
      expect(status2).not.toBeNull();
      expect(status2?.status).toBe("at_risk");

      // Create measurement with value 50 (should be off_track)
      const measurement3 = await performance.createMeasurement({
        kpiVersionId,
        scopeNodeId: "scope-3",
        period: "2026-03",
        value: 50.0,
        source: "MANUAL",
        submittedBy: userId,
      });

      const envelope3: DomainEventEnvelope = {
        eventId: "evt-3",
        eventType: "performance.measurement.recorded",
        eventVersion: 1,
        aggregateType: "measurement",
        aggregateId: measurement3.id,
        occurredAt: new Date().toISOString(),
        payload: {
          measurementId: measurement3.id,
          kpiVersionId,
          scopeNodeId: "scope-3",
          period: "2026-03",
          value: 50.0,
          source: "MANUAL",
          supersedesId: null,
        },
      };

      await recomputeSubscriber.handle(envelope3);

      const status3 = await performance.getStatusResult(
        kpiVersionId,
        "scope-3",
        "2026-03",
      );
      expect(status3).not.toBeNull();
      expect(status3?.status).toBe("off_track");
    });

    it("threshold.breached fires only on actual crossing into off-track", async () => {
      // Create measurement with value 85 (on_track)
      const measurement1 = await performance.createMeasurement({
        kpiVersionId,
        scopeNodeId: "scope-4",
        period: "2026-04",
        value: 85.0,
        source: "MANUAL",
        submittedBy: userId,
      });

      const envelope1: DomainEventEnvelope = {
        eventId: "evt-4",
        eventType: "performance.measurement.recorded",
        eventVersion: 1,
        aggregateType: "measurement",
        aggregateId: measurement1.id,
        occurredAt: new Date().toISOString(),
        payload: {
          measurementId: measurement1.id,
          kpiVersionId,
          scopeNodeId: "scope-4",
          period: "2026-04",
          value: 85.0,
          source: "MANUAL",
          supersedesId: null,
        },
      };

      await recomputeSubscriber.handle(envelope1);

      // Check that no threshold.breached event was emitted
      const breachEvents1 = await prisma.domainEvent.findMany({
        where: {
          eventType: "performance.threshold.breached",
          aggregateId: measurement1.id,
        },
      });
      expect(breachEvents1).toHaveLength(0);

      // Create correction with value 55 (crosses to off_track)
      const measurement2 = await performance.createMeasurement({
        kpiVersionId,
        scopeNodeId: "scope-4",
        period: "2026-04",
        value: 55.0,
        source: "MANUAL",
        supersedesId: measurement1.id,
        submittedBy: userId,
      });

      const envelope2: DomainEventEnvelope = {
        eventId: "evt-5",
        eventType: "performance.measurement.recorded",
        eventVersion: 1,
        aggregateType: "measurement",
        aggregateId: measurement2.id,
        occurredAt: new Date().toISOString(),
        payload: {
          measurementId: measurement2.id,
          kpiVersionId,
          scopeNodeId: "scope-4",
          period: "2026-04",
          value: 55.0,
          source: "MANUAL",
          supersedesId: measurement1.id,
        },
      };

      await recomputeSubscriber.handle(envelope2);

      // Check that threshold.breached event was emitted
      const breachEvents2 = await prisma.domainEvent.findMany({
        where: {
          eventType: "performance.threshold.breached",
          aggregateId: measurement2.id,
        },
      });
      expect(breachEvents2).toHaveLength(1);

      // Create another correction still in off_track (should not emit another breach)
      const measurement3 = await performance.createMeasurement({
        kpiVersionId,
        scopeNodeId: "scope-4",
        period: "2026-04",
        value: 50.0,
        source: "MANUAL",
        supersedesId: measurement2.id,
        submittedBy: userId,
      });

      const envelope3: DomainEventEnvelope = {
        eventId: "evt-6",
        eventType: "performance.measurement.recorded",
        eventVersion: 1,
        aggregateType: "measurement",
        aggregateId: measurement3.id,
        occurredAt: new Date().toISOString(),
        payload: {
          measurementId: measurement3.id,
          kpiVersionId,
          scopeNodeId: "scope-4",
          period: "2026-04",
          value: 50.0,
          source: "MANUAL",
          supersedesId: measurement2.id,
        },
      };

      await recomputeSubscriber.handle(envelope3);

      // Check that no new threshold.breached event was emitted
      const breachEvents3 = await prisma.domainEvent.findMany({
        where: {
          eventType: "performance.threshold.breached",
          aggregateId: measurement3.id,
        },
      });
      expect(breachEvents3).toHaveLength(0);
    });
  },
);
