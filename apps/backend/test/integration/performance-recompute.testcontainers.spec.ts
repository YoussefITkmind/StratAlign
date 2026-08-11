import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  goldenAverageRollupRule,
  goldenThresholdStatusRule,
} from "../../../../packages/rules/test/fixtures/golden-rules";

import { PrismaService } from "../../src/database/prisma.service";
import { EventBusService } from "../../src/events/event-bus.service";
import type { QueueService } from "../../src/queue/queue.service";
import type { DomainEventEnvelope } from "../../src/events/event.types";
import { createLogger } from "../../src/logging/logger";
import { RulesService } from "../../src/modules/rules/rules.service";
import { SCHEDULE_EVENT_TYPES } from "../../src/modules/scheduler/scheduler.events";

import { MeasurementService } from "../../src/modules/performance/measurement.service";
import { KpiBindingService } from "../../src/modules/performance/kpi-binding.service";
import { RecomputeService } from "../../src/modules/performance/recompute.service";
import { PerformanceResultsService } from "../../src/modules/performance/performance-results.service";
import { PerformanceRecomputeSubscriber } from "../../src/modules/performance/subscribers/performance-recompute.subscriber";
import {
  PERFORMANCE_EVENT_TYPES,
  PERFORMANCE_SCHEDULE_SUBJECT_TYPE,
} from "../../src/modules/performance/performance.events";

function applyMigrations(databaseUrl: string): void {
  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve("prisma/build/index.js");

  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}

const noopQueueService = {
  enqueue: async () => undefined,
} as unknown as QueueService;

const THRESHOLD_RULE_KEY = "performance-delivery-threshold";
const ROLLUP_RULE_KEY = "performance-delivery-rollup";

const PARENT_KPI = "kpi-parent";
const CHILD_A_KPI = "kpi-child-a";
const CHILD_B_KPI = "kpi-child-b";
const PARENT_VERSION = "kpi-parent-v1";
const CHILD_A_VERSION = "kpi-child-a-v1";
const CHILD_B_VERSION = "kpi-child-b-v1";
const SCOPE = "scope-north";
const PERIOD = "2026-Q1";

describe.sequential(
  "performance recompute against the rule engine golden fixtures",
  () => {
    let postgres: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
    let prisma: PrismaService;
    let measurements: MeasurementService;
    let bindings: KpiBindingService;
    let rules: RulesService;
    let recompute: RecomputeService;
    let results: PerformanceResultsService;
    let subscriber: PerformanceRecomputeSubscriber;
    let authorId: string;
    let thresholdRuleId: string;
    let rollupRuleId: string;

    beforeAll(async () => {
      postgres = await new PostgreSqlContainer("postgres:17-alpine")
        .withDatabase("spm_performance_recompute")
        .withUsername("spm_test")
        .withPassword("spm_test_password")
        .start();

      applyMigrations(postgres.getConnectionUri());

      prisma = new PrismaService(postgres.getConnectionUri());
      await prisma.connect();

      const logger = createLogger("error");
      const eventBus = new EventBusService(
        noopQueueService,
        logger.child("event-bus"),
      );

      measurements = new MeasurementService(
        prisma,
        eventBus,
        logger.child("measurement"),
      );
      bindings = new KpiBindingService(prisma);
      rules = new RulesService(prisma);
      results = new PerformanceResultsService(prisma);
      recompute = new RecomputeService(
        prisma,
        measurements,
        bindings,
        rules,
        eventBus,
        logger.child("recompute"),
      );
      subscriber = new PerformanceRecomputeSubscriber(
        recompute,
        logger.child("recompute-subscriber"),
      );
    }, 180_000);

    afterAll(async () => {
      await prisma?.disconnect();
      await postgres?.stop();
    }, 60_000);

    beforeEach(async () => {
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE
           "performance"."status_results",
           "performance"."rollup_results",
           "performance"."kpi_bindings",
           "performance"."measurements",
           "rules"."rule_definitions",
           "public"."domain_events",
           "iam"."users"
         RESTART IDENTITY CASCADE`,
      );

      const author = await prisma.user.create({
        data: { email: "rule-author@example.test" },
      });
      authorId = author.id;

      // The rules are the repository's golden fixtures, published through the
      // existing rules service rather than restated here.
      const thresholdDraft = await rules.createDraft({
        ruleKey: THRESHOLD_RULE_KEY,
        name: "Delivery threshold",
        document: goldenThresholdStatusRule,
        createdBy: authorId,
      });
      thresholdRuleId = (await rules.publish(thresholdDraft.id)).id;

      const rollupDraft = await rules.createDraft({
        ruleKey: ROLLUP_RULE_KEY,
        name: "Delivery rollup",
        document: goldenAverageRollupRule,
        createdBy: authorId,
      });
      rollupRuleId = (await rules.publish(rollupDraft.id)).id;

      await bindings.upsert({
        kpiId: PARENT_KPI,
        kpiVersionId: PARENT_VERSION,
        rollupRuleKey: ROLLUP_RULE_KEY,
      });
      await bindings.upsert({
        kpiId: CHILD_A_KPI,
        kpiVersionId: CHILD_A_VERSION,
        thresholdRuleKey: THRESHOLD_RULE_KEY,
        parentKpiId: PARENT_KPI,
      });
      await bindings.upsert({
        kpiId: CHILD_B_KPI,
        kpiVersionId: CHILD_B_VERSION,
        thresholdRuleKey: THRESHOLD_RULE_KEY,
        parentKpiId: PARENT_KPI,
      });
    });

    async function recordChildA(
      value: number,
      supersedesId?: string,
    ): Promise<string> {
      const measurement = await measurements.record({
        kpiVersionId: CHILD_A_VERSION,
        scopeNodeId: SCOPE,
        period: PERIOD,
        value,
        source: "MANUAL",
        supersedesId: supersedesId ?? null,
        submittedBy: authorId,
      });

      return measurement.id;
    }

    /** The envelope the outbox relay would hand to the dispatch worker. */
    async function latestMeasurementEnvelope(): Promise<DomainEventEnvelope> {
      const event = await prisma.domainEvent.findFirstOrThrow({
        where: {
          eventType: PERFORMANCE_EVENT_TYPES.measurementRecorded,
        },
        orderBy: { occurredAt: "desc" },
      });

      return {
        eventId: event.id,
        eventType: event.eventType,
        eventVersion: event.eventVersion,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        occurredAt: event.occurredAt.toISOString(),
        payload: event.payload as Record<string, unknown>,
      };
    }

    function countEvents(eventType: string): Promise<number> {
      return prisma.domainEvent.count({ where: { eventType } });
    }

    // -----------------------------------------------------------------------
    // Test group 4 — recompute correctness
    // -----------------------------------------------------------------------

    describe("status computation", () => {
      it(
        "turns a measurement event into a StatusResult from the golden rule",
        async () => {
          await recordChildA(90);
          const envelope = await latestMeasurementEnvelope();

          await subscriber.handle(envelope);

          const status = await results.getStatus({
            kpiVersionId: CHILD_A_VERSION,
            scopeNodeId: SCOPE,
            period: PERIOD,
          });

          // 90 lands in the golden rule's first band.
          expect(status).toMatchObject({
            kpiVersionId: CHILD_A_VERSION,
            scopeNodeId: SCOPE,
            period: PERIOD,
            status: "on_track",
            ruleVersionUsed: thresholdRuleId,
          });

          expect(
            await countEvents(PERFORMANCE_EVENT_TYPES.statusComputed),
          ).toBe(1);
        },
      );

      it("evaluates each golden band without any local threshold logic", async () => {
        const cases: Array<{ value: number; expected: string }> = [
          { value: 90, expected: "on_track" },
          { value: 80, expected: "on_track" },
          { value: 60, expected: "watch" },
          { value: 20, expected: "off_track" },
        ];

        let previousId: string | undefined;

        for (const testCase of cases) {
          previousId = await recordChildA(testCase.value, previousId);
          await subscriber.handle(await latestMeasurementEnvelope());

          const status = await results.getStatus({
            kpiVersionId: CHILD_A_VERSION,
            scopeNodeId: SCOPE,
            period: PERIOD,
          });

          expect(status?.status).toBe(testCase.expected);
        }
      });

      it("evaluates the golden rule's exact band boundaries", async () => {
        // The golden fixture bands are on_track >= 80, watch >= 50,
        // off_track < 50. Boundary values prove the measurement value reaches
        // the engine unmodified and that no local rounding is applied.
        const cases: Array<{ value: number; expected: string }> = [
          { value: 80, expected: "on_track" },
          { value: 79.999999, expected: "watch" },
          { value: 50, expected: "watch" },
          { value: 49.999999, expected: "off_track" },
        ];

        let previousId: string | undefined;

        for (const testCase of cases) {
          previousId = await recordChildA(testCase.value, previousId);
          await subscriber.handle(await latestMeasurementEnvelope());

          const status = await results.getStatus({
            kpiVersionId: CHILD_A_VERSION,
            scopeNodeId: SCOPE,
            period: PERIOD,
          });

          expect(status?.status).toBe(testCase.expected);
        }
      });

      it("populates computedAt on the persisted status", async () => {
        const before = Date.now();
        await recordChildA(90);
        await subscriber.handle(await latestMeasurementEnvelope());

        const stored = await prisma.statusResult.findFirstOrThrow();

        expect(stored.computedAt).toBeInstanceOf(Date);
        expect(stored.computedAt.getTime()).toBeGreaterThanOrEqual(
          before - 1_000,
        );
        expect(stored.computedAt.getTime()).toBeLessThanOrEqual(
          Date.now() + 1_000,
        );
      });

      it("evaluates the scope and period the event carried, not another", async () => {
        // Same KPI, three different coordinates, deliberately different bands.
        await recordChildA(90);
        await subscriber.handle(await latestMeasurementEnvelope());

        await measurements.record({
          kpiVersionId: CHILD_A_VERSION,
          scopeNodeId: "scope-south",
          period: PERIOD,
          value: 20,
          source: "MANUAL",
          submittedBy: authorId,
        });
        await subscriber.handle(await latestMeasurementEnvelope());

        await measurements.record({
          kpiVersionId: CHILD_A_VERSION,
          scopeNodeId: SCOPE,
          period: "2026-Q2",
          value: 60,
          source: "MANUAL",
          submittedBy: authorId,
        });
        await subscriber.handle(await latestMeasurementEnvelope());

        expect(
          (
            await results.getStatus({
              kpiVersionId: CHILD_A_VERSION,
              scopeNodeId: SCOPE,
              period: PERIOD,
            })
          )?.status,
        ).toBe("on_track");

        expect(
          (
            await results.getStatus({
              kpiVersionId: CHILD_A_VERSION,
              scopeNodeId: "scope-south",
              period: PERIOD,
            })
          )?.status,
        ).toBe("off_track");

        expect(
          (
            await results.getStatus({
              kpiVersionId: CHILD_A_VERSION,
              scopeNodeId: SCOPE,
              period: "2026-Q2",
            })
          )?.status,
        ).toBe("watch");
      });

      it("evaluates against the currently effective measurement after a correction", async () => {
        const first = await recordChildA(90);
        await subscriber.handle(await latestMeasurementEnvelope());

        await recordChildA(20, first);
        await subscriber.handle(await latestMeasurementEnvelope());

        // The correction, not the superseded original, drives the status.
        expect(
          (
            await results.getStatus({
              kpiVersionId: CHILD_A_VERSION,
              scopeNodeId: SCOPE,
              period: PERIOD,
            })
          )?.status,
        ).toBe("off_track");
      });

      it("fails permanently when the bound rule has never been published", async () => {
        await bindings.upsert({
          kpiId: "kpi-draft-rule",
          kpiVersionId: "kpi-draft-rule-v1",
          thresholdRuleKey: "a-rule-that-does-not-exist",
        });

        await measurements.record({
          kpiVersionId: "kpi-draft-rule-v1",
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 10,
          source: "MANUAL",
          submittedBy: authorId,
        });

        await expect(
          subscriber.handle(await latestMeasurementEnvelope()),
        ).rejects.toMatchObject({ name: "PermanentError" });

        expect(await prisma.statusResult.count()).toBe(0);
      });

      it("refuses to evaluate a rule that is still a draft", async () => {
        const draft = await rules.createDraft({
          ruleKey: "unpublished-threshold",
          name: "Unpublished threshold",
          document: goldenThresholdStatusRule,
          createdBy: authorId,
        });

        expect(draft.status).toBe("draft");

        await bindings.upsert({
          kpiId: "kpi-unpublished",
          kpiVersionId: "kpi-unpublished-v1",
          thresholdRuleKey: "unpublished-threshold",
        });

        await measurements.record({
          kpiVersionId: "kpi-unpublished-v1",
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 10,
          source: "MANUAL",
          submittedBy: authorId,
        });

        await expect(
          subscriber.handle(await latestMeasurementEnvelope()),
        ).rejects.toMatchObject({ name: "PermanentError" });

        expect(await prisma.statusResult.count()).toBe(0);
      });

      it("computes nothing when the KPI has no effective measurement", async () => {
        await recordChildA(90);
        const envelope = await latestMeasurementEnvelope();

        // Replay the event against a KPI/period with no measurement at all.
        await subscriber.handle({
          ...envelope,
          eventId: "33333333-3333-4333-8333-333333333333",
          payload: {
            ...envelope.payload,
            period: "2099-Q4",
          },
        });

        expect(
          await results.getStatus({
            kpiVersionId: CHILD_A_VERSION,
            scopeNodeId: SCOPE,
            period: "2099-Q4",
          }),
        ).toBeNull();
      });

      it("records the exact published rule version that produced the status", async () => {
        await recordChildA(90);
        await subscriber.handle(await latestMeasurementEnvelope());

        const stored = await prisma.statusResult.findFirstOrThrow();
        const rule = await prisma.ruleDefinition.findUniqueOrThrow({
          where: { id: stored.ruleVersionUsed },
        });

        expect(rule.ruleKey).toBe(THRESHOLD_RULE_KEY);
        expect(rule.version).toBe(1);
        expect(rule.status).toBe("PUBLISHED");
      });

      it("consumes schedule.window.closed for performance subjects", async () => {
        await recordChildA(20);

        const envelope: DomainEventEnvelope = {
          eventId: "11111111-1111-4111-8111-111111111111",
          eventType: SCHEDULE_EVENT_TYPES.windowClosed,
          eventVersion: 1,
          aggregateType: "cadence_instance",
          aggregateId: "instance-1",
          occurredAt: new Date().toISOString(),
          payload: {
            subjectType: PERFORMANCE_SCHEDULE_SUBJECT_TYPE,
            subjectId: CHILD_A_VERSION,
            periodKey: PERIOD,
            payload: { scopeNodeId: SCOPE },
          },
        };

        await subscriber.handle(envelope);

        const status = await results.getStatus({
          kpiVersionId: CHILD_A_VERSION,
          scopeNodeId: SCOPE,
          period: PERIOD,
        });

        expect(status?.status).toBe("off_track");
      });

      it("ignores schedule windows belonging to another module", async () => {
        await recordChildA(20);

        await subscriber.handle({
          eventId: "22222222-2222-4222-8222-222222222222",
          eventType: SCHEDULE_EVENT_TYPES.windowClosed,
          eventVersion: 1,
          aggregateType: "cadence_instance",
          aggregateId: "instance-2",
          occurredAt: new Date().toISOString(),
          payload: {
            subjectType: "some_other_module",
            subjectId: CHILD_A_VERSION,
            periodKey: PERIOD,
            payload: { scopeNodeId: SCOPE },
          },
        });

        expect(await prisma.statusResult.count()).toBe(0);
      });
    });

    // -----------------------------------------------------------------------
    // Test group 4 — hierarchy roll-up
    // -----------------------------------------------------------------------

    describe("roll-up computation", () => {
      it("aggregates children through the golden rollup rule", async () => {
        await recordChildA(90);
        await measurements.record({
          kpiVersionId: CHILD_B_VERSION,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 70,
          source: "MANUAL",
          submittedBy: authorId,
        });

        await subscriber.handle(await latestMeasurementEnvelope());

        const rollup = await results.getRollup({
          parentKpiId: PARENT_KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
        });

        // The golden rollup fixture is an average: (90 + 70) / 2.
        expect(rollup).toMatchObject({
          parentKpiId: PARENT_KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          aggregatedValue: 80,
          method: "average",
          ruleVersionUsed: rollupRuleId,
        });
      });

      it("excludes children with no measurement", async () => {
        await recordChildA(90);

        await subscriber.handle(await latestMeasurementEnvelope());

        const rollup = await results.getRollup({
          parentKpiId: PARENT_KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
        });

        expect(rollup?.aggregatedValue).toBe(90);
      });

      it("ignores children belonging to a different parent", async () => {
        // A KPI under another parent must not leak into this aggregation.
        await bindings.upsert({
          kpiId: "kpi-outsider",
          kpiVersionId: "kpi-outsider-v1",
          thresholdRuleKey: THRESHOLD_RULE_KEY,
          parentKpiId: "kpi-other-parent",
        });

        await measurements.record({
          kpiVersionId: "kpi-outsider-v1",
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 1_000,
          source: "MANUAL",
          submittedBy: authorId,
        });

        await recordChildA(90);
        await measurements.record({
          kpiVersionId: CHILD_B_VERSION,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 70,
          source: "MANUAL",
          submittedBy: authorId,
        });

        await subscriber.handle(await latestMeasurementEnvelope());

        const rollup = await results.getRollup({
          parentKpiId: PARENT_KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
        });

        // Still (90 + 70) / 2 — the outsider's 1000 is nowhere in it.
        expect(rollup?.aggregatedValue).toBe(80);
      });

      it("ignores child measurements from another scope or period", async () => {
        // Child B has values only outside the aggregated coordinates. They are
        // recorded first so the triggering event is child A's.
        await measurements.record({
          kpiVersionId: CHILD_B_VERSION,
          scopeNodeId: "scope-south",
          period: PERIOD,
          value: 10,
          source: "MANUAL",
          submittedBy: authorId,
        });
        await measurements.record({
          kpiVersionId: CHILD_B_VERSION,
          scopeNodeId: SCOPE,
          period: "2026-Q2",
          value: 10,
          source: "MANUAL",
          submittedBy: authorId,
        });

        await recordChildA(90);
        await subscriber.handle(await latestMeasurementEnvelope());

        const rollup = await results.getRollup({
          parentKpiId: PARENT_KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
        });

        // Only child A contributes, so the average is its own value.
        expect(rollup?.aggregatedValue).toBe(90);
      });

      it("populates computedAt and the rule version on the rollup", async () => {
        const before = Date.now();
        await recordChildA(90);
        await subscriber.handle(await latestMeasurementEnvelope());

        const stored = await prisma.rollupResult.findFirstOrThrow();

        expect(stored.computedAt).toBeInstanceOf(Date);
        expect(stored.computedAt.getTime()).toBeGreaterThanOrEqual(
          before - 1_000,
        );
        expect(stored.method).toBe("average");
        expect(stored.parentKpiId).toBe(PARENT_KPI);
        expect(stored.scopeNodeId).toBe(SCOPE);
        expect(stored.period).toBe(PERIOD);

        const rule = await prisma.ruleDefinition.findUniqueOrThrow({
          where: { id: stored.ruleVersionUsed },
        });
        expect(rule.ruleKey).toBe(ROLLUP_RULE_KEY);
        expect(rule.status).toBe("PUBLISHED");
      });

      it("aggregates the corrected value after a supersession", async () => {
        const first = await recordChildA(90);
        await subscriber.handle(await latestMeasurementEnvelope());

        await recordChildA(50, first);
        await subscriber.handle(await latestMeasurementEnvelope());

        const rollup = await results.getRollup({
          parentKpiId: PARENT_KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
        });

        expect(rollup?.aggregatedValue).toBe(50);
      });
    });

    // -----------------------------------------------------------------------
    // Test group 5 — threshold breach transitions
    // -----------------------------------------------------------------------

    describe("threshold breach transitions", () => {
      async function recomputeWith(
        value: number,
        supersedesId?: string,
      ): Promise<string> {
        const id = await recordChildA(value, supersedesId);
        await subscriber.handle(await latestMeasurementEnvelope());
        return id;
      }

      it("emits a breach only when the status crosses into off-track", async () => {
        const breaches = () =>
          countEvents(PERFORMANCE_EVENT_TYPES.thresholdBreached);

        // on_track: no breach
        const m1 = await recomputeWith(90);
        expect(await breaches()).toBe(0);

        // on_track -> off_track: breach
        const m2 = await recomputeWith(20, m1);
        expect(await breaches()).toBe(1);

        // off_track -> off_track: no further breach
        const m3 = await recomputeWith(10, m2);
        expect(await breaches()).toBe(1);

        // off_track -> on_track: recovery, still no breach
        const m4 = await recomputeWith(95, m3);
        expect(await breaches()).toBe(1);

        // on_track -> off_track again: a second crossing breaches again
        await recomputeWith(15, m4);
        expect(await breaches()).toBe(2);

        // Every computation produced a status regardless of breaching.
        expect(
          await countEvents(PERFORMANCE_EVENT_TYPES.statusComputed),
        ).toBe(5);
        expect(await prisma.statusResult.count()).toBe(5);
      });

      it("does not breach again while the status stays off-track", async () => {
        // Isolated from the full sequence so a regression in the transition
        // guard names this case specifically.
        const m1 = await recomputeWith(20);
        expect(
          await countEvents(PERFORMANCE_EVENT_TYPES.thresholdBreached),
        ).toBe(1);

        const m2 = await recomputeWith(10, m1);
        await recomputeWith(5, m2);

        expect(
          await countEvents(PERFORMANCE_EVENT_TYPES.thresholdBreached),
        ).toBe(1);
        expect(
          await countEvents(PERFORMANCE_EVENT_TYPES.statusComputed),
        ).toBe(3);
        expect(await prisma.statusResult.count()).toBe(3);
      });

      it("does not breach while the status stays on-track", async () => {
        const m1 = await recomputeWith(90);
        const m2 = await recomputeWith(85, m1);
        await recomputeWith(95, m2);

        expect(
          await countEvents(PERFORMANCE_EVENT_TYPES.thresholdBreached),
        ).toBe(0);
        expect(
          await countEvents(PERFORMANCE_EVENT_TYPES.statusComputed),
        ).toBe(3);
      });

      it("carries the crossing itself in the breach payload", async () => {
        const m1 = await recomputeWith(90);
        await recomputeWith(20, m1);

        const breach = await prisma.domainEvent.findFirstOrThrow({
          where: {
            eventType: PERFORMANCE_EVENT_TYPES.thresholdBreached,
          },
        });

        // A consumer must be able to see what the status crossed *from*, not
        // merely that something is off-track now.
        expect(breach.payload).toMatchObject({
          kpiVersionId: CHILD_A_VERSION,
          scopeNodeId: SCOPE,
          period: PERIOD,
          status: "off_track",
          previousStatus: "on_track",
          ruleVersionUsed: thresholdRuleId,
        });

        const payload = breach.payload as Record<string, unknown>;
        expect(typeof payload.breachedAt).toBe("string");
        expect(
          Number.isNaN(Date.parse(payload.breachedAt as string)),
        ).toBe(false);

        // The breach points at the StatusResult that caused it.
        const statusResult = await prisma.statusResult.findUniqueOrThrow({
          where: { id: payload.statusResultId as string },
        });
        expect(statusResult.status).toBe("off_track");

        expect(breach.aggregateType).toBe("performance_kpi");
        expect(breach.aggregateId).toBe(CHILD_A_VERSION);
        expect(breach.status).toBe("PENDING");
      });

      it("carries the full transition in the status.computed payload", async () => {
        const m1 = await recomputeWith(90);
        await recomputeWith(60, m1);

        const events = await prisma.domainEvent.findMany({
          where: {
            eventType: PERFORMANCE_EVENT_TYPES.statusComputed,
          },
          orderBy: { occurredAt: "asc" },
        });

        expect(events).toHaveLength(2);

        expect(events[0]?.payload).toMatchObject({
          kpiVersionId: CHILD_A_VERSION,
          scopeNodeId: SCOPE,
          period: PERIOD,
          status: "on_track",
          previousStatus: null,
          ruleVersionUsed: thresholdRuleId,
        });

        expect(events[1]?.payload).toMatchObject({
          status: "watch",
          previousStatus: "on_track",
          ruleVersionUsed: thresholdRuleId,
        });
      });

      it("emits status.computed but no breach on recovery", async () => {
        const m1 = await recomputeWith(20);
        await recomputeWith(90, m1);

        const breaches = await prisma.domainEvent.findMany({
          where: {
            eventType: PERFORMANCE_EVENT_TYPES.thresholdBreached,
          },
        });

        // Exactly one breach, from the initial crossing — recovery adds none.
        expect(breaches).toHaveLength(1);
        expect(breaches[0]?.payload).toMatchObject({
          status: "off_track",
          previousStatus: null,
        });

        const latest = await prisma.domainEvent.findFirstOrThrow({
          where: {
            eventType: PERFORMANCE_EVENT_TYPES.statusComputed,
          },
          orderBy: { occurredAt: "desc" },
        });

        expect(latest.payload).toMatchObject({
          status: "on_track",
          previousStatus: "off_track",
        });
      });

      it("treats a first-ever off-track status as a crossing", async () => {
        await recomputeWith(20);

        expect(
          await countEvents(PERFORMANCE_EVENT_TYPES.thresholdBreached),
        ).toBe(1);
      });

      it("does not breach when the first status is on-track", async () => {
        await recomputeWith(90);

        expect(
          await countEvents(PERFORMANCE_EVENT_TYPES.thresholdBreached),
        ).toBe(0);
      });
    });

    // -----------------------------------------------------------------------
    // Result read procedures
    // -----------------------------------------------------------------------

    describe("status and rollup reads", () => {
      it("returns the most recent status when several have been computed", async () => {
        const m1 = await recordChildA(90);
        await subscriber.handle(await latestMeasurementEnvelope());

        const m2 = await recordChildA(60, m1);
        await subscriber.handle(await latestMeasurementEnvelope());

        await recordChildA(20, m2);
        await subscriber.handle(await latestMeasurementEnvelope());

        expect(await prisma.statusResult.count()).toBe(3);

        // History is retained; the read returns the latest.
        const status = await results.getStatus({
          kpiVersionId: CHILD_A_VERSION,
          scopeNodeId: SCOPE,
          period: PERIOD,
        });

        expect(status?.status).toBe("off_track");
        expect(status?.ruleVersionUsed).toBe(thresholdRuleId);
      });

      it("returns null rather than another KPI's status", async () => {
        await recordChildA(90);
        await subscriber.handle(await latestMeasurementEnvelope());

        expect(
          await results.getStatus({
            kpiVersionId: CHILD_B_VERSION,
            scopeNodeId: SCOPE,
            period: PERIOD,
          }),
        ).toBeNull();

        expect(
          await results.getStatus({
            kpiVersionId: CHILD_A_VERSION,
            scopeNodeId: "scope-south",
            period: PERIOD,
          }),
        ).toBeNull();

        expect(
          await results.getStatus({
            kpiVersionId: CHILD_A_VERSION,
            scopeNodeId: SCOPE,
            period: "2026-Q2",
          }),
        ).toBeNull();
      });

      it("returns null when nothing has been computed at all", async () => {
        expect(
          await results.getStatus({
            kpiVersionId: CHILD_A_VERSION,
            scopeNodeId: SCOPE,
            period: PERIOD,
          }),
        ).toBeNull();

        expect(
          await results.getRollup({
            parentKpiId: PARENT_KPI,
            scopeNodeId: SCOPE,
            period: PERIOD,
          }),
        ).toBeNull();
      });

      it("returns the most recent rollup and never an unrelated one", async () => {
        const m1 = await recordChildA(90);
        await subscriber.handle(await latestMeasurementEnvelope());

        await recordChildA(50, m1);
        await subscriber.handle(await latestMeasurementEnvelope());

        expect(await prisma.rollupResult.count()).toBe(2);

        const rollup = await results.getRollup({
          parentKpiId: PARENT_KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
        });
        expect(rollup?.aggregatedValue).toBe(50);

        expect(
          await results.getRollup({
            parentKpiId: "kpi-some-other-parent",
            scopeNodeId: SCOPE,
            period: PERIOD,
          }),
        ).toBeNull();

        expect(
          await results.getRollup({
            parentKpiId: PARENT_KPI,
            scopeNodeId: "scope-south",
            period: PERIOD,
          }),
        ).toBeNull();

        expect(
          await results.getRollup({
            parentKpiId: PARENT_KPI,
            scopeNodeId: SCOPE,
            period: "2026-Q2",
          }),
        ).toBeNull();
      });
    });

    // -----------------------------------------------------------------------
    // Worker retry safety
    // -----------------------------------------------------------------------

    describe("retry safety", () => {
      it("produces no duplicate results or events when an event is redelivered", async () => {
        await recordChildA(20);
        const envelope = await latestMeasurementEnvelope();

        await subscriber.handle(envelope);
        await subscriber.handle(envelope);
        await subscriber.handle(envelope);

        expect(await prisma.statusResult.count()).toBe(1);
        expect(await prisma.rollupResult.count()).toBe(1);
        expect(
          await countEvents(PERFORMANCE_EVENT_TYPES.statusComputed),
        ).toBe(1);
        expect(
          await countEvents(PERFORMANCE_EVENT_TYPES.thresholdBreached),
        ).toBe(1);
      });

      it("keeps concurrent redeliveries to a single result", async () => {
        await recordChildA(20);
        const envelope = await latestMeasurementEnvelope();

        await Promise.all([
          subscriber.handle(envelope),
          subscriber.handle(envelope),
          subscriber.handle(envelope),
        ]);

        expect(await prisma.statusResult.count()).toBe(1);
        expect(
          await countEvents(PERFORMANCE_EVENT_TYPES.thresholdBreached),
        ).toBe(1);
      });

      it("fails permanently for a KPI with no binding", async () => {
        await measurements.record({
          kpiVersionId: "kpi-unbound-v1",
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 10,
          source: "MANUAL",
          submittedBy: authorId,
        });

        await expect(
          subscriber.handle(await latestMeasurementEnvelope()),
        ).rejects.toMatchObject({ name: "PermanentError" });
      });
    });
  },
);
