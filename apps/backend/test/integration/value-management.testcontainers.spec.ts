import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { Client } from "pg";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { createActor } from "xstate";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { valueLifecycleMachine } from "@spm/machines";

import { PrismaService } from "../../src/database/prisma.service";
import { createLogger } from "../../src/logging/logger";
import type { EventBusService } from "../../src/events/event-bus.service";
import { GovernanceService } from "../../src/modules/governance/governance.service";
import { GovernanceEscalationService } from "../../src/modules/governance/governance-escalation.service";
import { RulesService } from "../../src/modules/rules/rules.service";
import { CadenceEngine } from "../../src/modules/cadence/cadence.engine";
import { SchedulerService } from "../../src/modules/scheduler/scheduler.service";
import { ValueService } from "../../src/modules/value/value.service";
import { ScheduledValueService } from "../../src/modules/value/scheduled-value.service";

function applyMigrations(databaseUrl: string): void {
  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve("prisma/build/index.js");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}

const noopEventBus = {
  publishWithin: async () => 1,
  nudgeRelay: async () => undefined,
} as unknown as EventBusService;

describe.sequential("Value Management Core with PostgreSQL Testcontainers", () => {
  let postgres: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let databaseUrl: string;
  let prisma: PrismaService;
  let rules: RulesService;
  let governance: GovernanceService;
  let escalation: GovernanceEscalationService;
  let value: ValueService;
  let scheduledValue: ScheduledValueService;
  let ownerId: string;
  let approverId: string;
  let initiativeId: string;
  let categoryId: string;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer("postgres:17-alpine")
      .withDatabase("spm_value_test")
      .withUsername("spm_test")
      .withPassword("spm_test_password")
      .start();
    databaseUrl = postgres.getConnectionUri();
    applyMigrations(databaseUrl);
    prisma = new PrismaService(databaseUrl);
    await prisma.connect();
    rules = new RulesService(prisma);
    governance = new GovernanceService(prisma, noopEventBus, rules);
    escalation = new GovernanceEscalationService(prisma, noopEventBus);
    value = new ValueService(prisma, governance, escalation, rules);
    const scheduler = new SchedulerService(
      prisma,
      new CadenceEngine(),
      { defaultTimezone: "UTC", defaultLookaheadSeconds: 86_400 },
      createLogger("error", "value-test"),
    );
    scheduledValue = new ScheduledValueService(prisma, governance, escalation, rules, scheduler);
  }, 180_000);

  afterAll(async () => {
    await prisma?.disconnect();
    await postgres?.stop();
  }, 60_000);

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE
      "value"."gate_reviews",
      "value"."checkins",
      "value"."value_state_entries",
      "value"."benefit_feed_bindings",
      "value"."benefit_baselines",
      "value"."benefits",
      "scheduling"."cadence_instances",
      "scheduling"."cadence_definitions",
      "governance"."escalation_cases",
      "governance"."decision_log_entries",
      "governance"."approval_cases",
      "governance"."workflow_definitions",
      "rules"."rule_definitions",
      "execution"."initiatives",
      "strategy"."owner_assignments",
      "strategy"."strategy_nodes",
      "strategy"."plan_versions",
      "iam"."users"
      RESTART IDENTITY CASCADE`);

    const owner = await prisma.user.create({ data: { email: "value-owner@example.test", displayName: "Value Owner" } });
    const approver = await prisma.user.create({ data: { email: "value-approver@example.test", displayName: "Value Approver" } });
    ownerId = owner.id;
    approverId = approver.id;

    const plan = await prisma.planVersion.create({ data: { name: "Value Test Plan", status: "ACTIVE" } });
    const play = await prisma.strategyNode.create({
      data: {
        type: "STRATEGIC_PLAY",
        nameEn: "Value Play",
        nameAr: "مسار القيمة",
        planVersionId: plan.id,
        state: "ACTIVE",
        createdBy: ownerId,
      },
    });
    const initiative = await prisma.initiative.create({
      data: {
        nameEn: "Value Initiative",
        nameAr: "مبادرة القيمة",
        strategicPlayNodeId: play.id,
        ownerUserId: ownerId,
        stage: "EXECUTE",
      },
    });
    initiativeId = initiative.id;

    const categories = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "value"."value_categories" WHERE key = 'revenue_growth'`,
    );
    categoryId = categories[0]!.id;
  });

  async function insertBenefit(state = "approved", snapshot: unknown = {}) {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO "value"."benefits"
        (initiative_id, category_id, driver, owner_user_id, lifecycle_state, workflow_snapshot)
       VALUES ($1::uuid, $2::uuid, 'Revenue uplift', $3, $4::"value"."ValueLifecycleState", $5::jsonb)
       RETURNING id`,
      initiativeId,
      categoryId,
      ownerId,
      state,
      JSON.stringify(snapshot),
    );
    return rows[0]!.id;
  }

  describe("database invariants", () => {
    it("enforces BenefitBaseline immutability with the spm_app database role", async () => {
      const benefitId = await insertBenefit();
      const baseline = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO "value"."benefit_baselines" (benefit_id, amount, currency, approved_at)
         VALUES ($1::uuid, 1000, 'SAR', CURRENT_TIMESTAMP) RETURNING id`,
        benefitId,
      );

      const client = new Client({ connectionString: databaseUrl });
      await client.connect();
      try {
        await client.query(`SET ROLE spm_app`);
        await expect(client.query(
          `UPDATE "value"."benefit_baselines" SET amount = 999 WHERE id = $1::uuid`,
          [baseline[0]!.id],
        )).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.query(`RESET ROLE`).catch(() => undefined);
        await client.end();
      }

      const persisted = await prisma.$queryRawUnsafe<Array<{ amount: string }>>(
        `SELECT amount::text FROM "value"."benefit_baselines" WHERE id = $1::uuid`,
        baseline[0]!.id,
      );
      expect(Number(persisted[0]!.amount)).toBe(1000);
    });

    it("rejects manual realized values after a feed binding exists", async () => {
      const benefitId = await insertBenefit("tracking");
      await value.bindFeed({ benefitId, bindingRef: "erp:value-stream-42" });

      await expect(value.recordState({
        benefitId,
        state: "realized",
        amount: 250,
        currency: "SAR",
        period: "2026-08",
        source: "manual",
      })).rejects.toThrow(/must use source=feed/);

      const accepted = await value.recordState({
        benefitId,
        state: "realized",
        amount: 250,
        currency: "SAR",
        period: "2026-08",
        source: "feed",
        lineageRef: "erp-row-42",
      });
      expect(accepted?.source).toBe("feed");
    });
  });

  describe("scheduler check-ins and escalation", () => {
    it("creates exact 3/6/12 month scheduler-backed check-ins and escalates overdue incomplete work", async () => {
      const actor = createActor(valueLifecycleMachine, {
        input: {
          benefitId: "placeholder",
          approvalCaseId: null,
          baselineExists: true,
          realizedEntryCount: 1,
          stopReason: null,
        },
      });
      actor.start();
      actor.send({ type: "SUBMIT_FOR_APPROVAL", approvalCaseId: "00000000-0000-4000-8000-000000000001" });
      actor.send({ type: "APPROVAL_GRANTED" });
      actor.send({ type: "BEGIN_VALIDATION" });
      actor.send({ type: "START_TRACKING" });

      const benefitId = await insertBenefit("tracking", actor.getPersistedSnapshot());
      await prisma.$executeRawUnsafe(
        `INSERT INTO "value"."value_state_entries" (benefit_id, state, amount, currency, period, source)
         VALUES ($1::uuid, 'realized', 500, 'SAR', '2026-08', 'manual')`,
        benefitId,
      );

      const deliveredAt = new Date("2026-08-16T10:15:00.000Z");
      await scheduledValue.transition({
        benefitId,
        event: "close",
        actorUserId: ownerId,
        now: deliveredAt,
      });

      const checkins = await value.listCheckins(benefitId);
      expect(checkins.map((item) => [item.months_post_delivery, item.due_at.toISOString()])).toEqual([
        [3, "2026-11-16T10:15:00.000Z"],
        [6, "2027-02-16T10:15:00.000Z"],
        [12, "2027-08-16T10:15:00.000Z"],
      ]);

      const definitions = await prisma.cadenceDefinition.findMany({
        where: { subjectType: "value_checkin" },
        orderBy: { nextOccurrenceAt: "asc" },
      });
      expect(definitions).toHaveLength(3);
      expect(definitions.map((definition) => definition.subjectId).sort()).toEqual(
        checkins.map((item) => item.id).sort(),
      );

      const raised = await value.escalateOverdueCheckins(new Date("2026-11-16T10:15:00.001Z"));
      expect(raised).toHaveLength(1);
      expect(raised[0]!.checkinId).toBe(checkins[0]!.id);
      const escalationRows = await prisma.escalationCase.findMany({ where: { participant: ownerId } });
      expect(escalationRows).toHaveLength(1);
    });
  });

  describe("gate review evidence", () => {
    it("stores the gate_criteria evaluation snapshot and keeps it immutable after rule changes", async () => {
      const v1 = await rules.createDraft({
        ruleKey: "value-realization-gate",
        name: "Value realization gate",
        createdBy: ownerId,
        document: {
          ruleType: "gate_criteria",
          criteria: [{ name: "ROI threshold", fact: "roi", operator: "gte", expected: 1 }],
        },
      });
      await rules.publish(v1.id);

      const review = await value.createGateReview({
        initiativeId,
        stage: "execute",
        ruleKey: "value-realization-gate",
        criteriaInput: { facts: { roi: 1.5 } },
        createdBy: ownerId,
      });
      const snapshot = review?.criteria_eval_snapshot as { ruleVersion: number; result: { passed: boolean } };
      expect(snapshot.ruleVersion).toBe(1);
      expect(snapshot.result.passed).toBe(true);

      const v2 = await rules.createDraft({
        ruleKey: "value-realization-gate",
        name: "Value realization gate v2",
        createdBy: ownerId,
        document: {
          ruleType: "gate_criteria",
          criteria: [{ name: "ROI threshold", fact: "roi", operator: "gte", expected: 2 }],
        },
      });
      await rules.publish(v2.id);

      const persisted = await prisma.$queryRawUnsafe<Array<{ criteria_eval_snapshot: { ruleVersion: number; result: { passed: boolean } } }>>(
        `SELECT criteria_eval_snapshot FROM "value"."gate_reviews" WHERE id = $1::uuid`,
        review!.id,
      );
      expect(persisted[0]!.criteria_eval_snapshot.ruleVersion).toBe(1);
      expect(persisted[0]!.criteria_eval_snapshot.result.passed).toBe(true);

      await expect(prisma.$executeRawUnsafe(
        `UPDATE "value"."gate_reviews" SET criteria_eval_snapshot = '{"tampered":true}'::jsonb WHERE id = $1::uuid`,
        review!.id,
      )).rejects.toThrow(/criteria snapshot is immutable/);

      const decided = await value.decideGateReview({
        gateReviewId: review!.id,
        decision: "continue",
        decidedBy: approverId,
      });
      expect(decided?.decision).toBe("continue");
    });
  });
});
