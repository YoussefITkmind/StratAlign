import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaService } from "../../src/database/prisma.service";
import type { EventBusService } from "../../src/events/event-bus.service";
import type { EventPublicationRequest } from "../../src/events/event.types";
import { StageAwareExecutionService } from "../../src/modules/execution/stage-aware-execution.service";
import { EXECUTION_STAGE_EVENT_TYPE } from "../../src/modules/execution/execution-stage.events";
import { GovernanceService } from "../../src/modules/governance/governance.service";
import { GovernanceEscalationService } from "../../src/modules/governance/governance-escalation.service";
import { RulesService } from "../../src/modules/rules/rules.service";
import { ValueService } from "../../src/modules/value/value.service";
import { ValueGateCore } from "../../src/modules/value/value-gate.core";
import { ValueGateStageSubscriber } from "../../src/modules/value/value-gate-stage.subscriber";

function applyMigrations(databaseUrl: string): void {
  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve("prisma/build/index.js");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}

describe.sequential("Phase 5.2 Value Gates with PostgreSQL Testcontainers", () => {
  let postgres: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let prisma: PrismaService;
  let captured: EventPublicationRequest[];
  let eventBus: EventBusService;
  let governance: GovernanceService;
  let escalation: GovernanceEscalationService;
  let rules: RulesService;
  let value: ValueService;
  let gates: ValueGateCore;
  let execution: StageAwareExecutionService;
  let ownerId: string;
  let committeeId: string;
  let playId: string;
  let categoryId: string;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer("postgres:17-alpine")
      .withDatabase("spm_value_gate_test")
      .withUsername("spm_test")
      .withPassword("spm_test_password")
      .start();
    const databaseUrl = postgres.getConnectionUri();
    applyMigrations(databaseUrl);
    prisma = new PrismaService(databaseUrl);
    await prisma.connect();
  }, 180_000);

  afterAll(async () => {
    await prisma?.disconnect();
    await postgres?.stop();
  }, 60_000);

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE
      "value"."gate_corrective_action_requirements",
      "value"."gate_review_evidence",
      "value"."gate_reviews",
      "value"."checkins",
      "value"."value_state_entries",
      "value"."benefit_feed_bindings",
      "value"."benefit_baselines",
      "value"."benefits",
      "execution"."risk_indicators",
      "execution"."financial_attrs",
      "execution"."status_updates",
      "execution"."milestone_flags",
      "execution"."jira_links",
      "execution"."initiatives",
      "governance"."escalation_cases",
      "governance"."decision_log_entries",
      "governance"."approval_cases",
      "governance"."workflow_definitions",
      "rules"."rule_definitions",
      "iam"."scope_grants",
      "iam"."roles",
      "strategy"."owner_assignments",
      "strategy"."strategy_nodes",
      "strategy"."plan_versions",
      "public"."domain_events",
      "iam"."users"
      RESTART IDENTITY CASCADE`);

    captured = [];
    eventBus = {
      publishWithin: async (_tx: unknown, requests: EventPublicationRequest[]) => {
        captured.push(...requests);
        return requests.length;
      },
      nudgeRelay: async () => undefined,
    } as unknown as EventBusService;
    rules = new RulesService(prisma);
    governance = new GovernanceService(prisma, eventBus, rules);
    escalation = new GovernanceEscalationService(prisma, eventBus);
    value = new ValueService(prisma, governance, escalation, rules);
    gates = new ValueGateCore(prisma, governance, rules);
    execution = new StageAwareExecutionService(prisma, prisma, eventBus);

    const owner = await prisma.user.create({ data: { email: "gate-owner@example.test", displayName: "Initiative Creator" } });
    const committee = await prisma.user.create({ data: { email: "committee@example.test", displayName: "Committee Member" } });
    ownerId = owner.id;
    committeeId = committee.id;

    const committeeRole = await prisma.role.create({
      data: { name: "governance_committee", description: "Value Gate committee" },
    });
    await prisma.scopeGrant.create({
      data: {
        userId: committeeId,
        roleId: committeeRole.id,
        orgScopeType: "GROUP",
        orgScopeId: "all",
        grantedById: ownerId,
      },
    });

    const plan = await prisma.planVersion.create({ data: { name: "Gate Test Plan", status: "ACTIVE" } });
    const play = await prisma.strategyNode.create({
      data: {
        type: "STRATEGIC_PLAY",
        nameEn: "Gate Play",
        nameAr: "مسار البوابة",
        planVersionId: plan.id,
        state: "ACTIVE",
        createdBy: ownerId,
      },
    });
    playId = play.id;
    await prisma.ownerAssignment.create({ data: { nodeId: playId, ownerUserId: ownerId, assignedBy: ownerId } });

    const categories = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "value"."value_categories" WHERE key = 'revenue_growth'`,
    );
    categoryId = categories[0]!.id;
  });

  async function initiative(stage: "design" | "pilot" | "execute" | "scale" = "design") {
    return execution.registerInitiative({
      nameEn: `Gate ${stage}`,
      nameAr: "مبادرة",
      strategicPlayNodeId: playId,
      ownerUserId: ownerId,
      stage,
      actorUserId: ownerId,
      actorIsSeoAdministrator: false,
    });
  }

  async function benefit(initiativeId: string) {
    return value.registerBenefit({
      initiativeId,
      categoryId,
      driver: "Realize measurable value",
      ownerUserId: ownerId,
    });
  }

  async function pendingGate(initiativeId: string, stage = "pilot") {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO "value"."gate_reviews"
        (initiative_id, from_stage, stage, criteria_eval_snapshot, created_by)
       VALUES ($1::uuid, 'design', $2, '{"status":"pending"}'::jsonb, $3)
       RETURNING id`,
      initiativeId,
      stage,
      ownerId,
    );
    return rows[0]!.id;
  }

  it("auto-creates an evaluated pending GateReview and Approval Tray case from a stage-transition outbox event", async () => {
    const item = await initiative("design");
    await execution.transitionStage({
      initiativeId: item.id,
      toStage: "pilot",
      actorUserId: ownerId,
      actorIsSeoAdministrator: false,
    });
    const event = captured.find((entry) => entry.eventType === EXECUTION_STAGE_EVENT_TYPE);
    expect(event).toBeDefined();

    const subscriber = new ValueGateStageSubscriber(gates);
    await subscriber.handle({
      eventId: "stage-event-1",
      eventType: event!.eventType,
      eventVersion: event!.eventVersion,
      aggregateType: event!.aggregateType,
      aggregateId: event!.aggregateId,
      occurredAt: new Date().toISOString(),
      payload: event!.payload,
    });

    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string;
      from_stage: string;
      stage: string;
      decision: string | null;
      approval_case_id: string;
      criteria_eval_snapshot: { status: string };
    }>>(
      `SELECT id, from_stage, stage, decision::text, approval_case_id, criteria_eval_snapshot
       FROM "value"."gate_reviews" WHERE initiative_id = $1::uuid`,
      item.id,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ from_stage: "design", stage: "pilot", decision: null });
    expect(rows[0]!.criteria_eval_snapshot.status).toBe("evaluated");
    expect(rows[0]!.approval_case_id).toBeTruthy();

    const tray = await governance.myPendingApprovals(committeeId);
    expect(tray).toHaveLength(1);
    expect(tray[0]!.entityType).toBe("value_gate_review");
    expect(tray[0]!.entityId).toBe(rows[0]!.id);
  });

  it("snapshots all-pass, one-fail and all-fail criteria evaluations", async () => {
    const allPassInitiative = await initiative("pilot");
    const allPassBenefit = await benefit(allPassInitiative.id);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "value"."benefit_baselines" (benefit_id, amount, currency, approved_at)
       VALUES ($1::uuid, 100, 'SAR', CURRENT_TIMESTAMP)`,
      allPassBenefit.id,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "value"."value_state_entries" (benefit_id, state, amount, currency, period, source)
       VALUES ($1::uuid, 'realized', 95, 'SAR', '2026-08', 'manual')`,
      allPassBenefit.id,
    );
    const allPassGate = await pendingGate(allPassInitiative.id);
    const allPass = await gates.evaluateCriteria(allPassGate, ownerId) as { criteria_eval_snapshot: { passed: boolean; rules: Array<{ result: { passed: boolean } }> } };
    expect(allPass.criteria_eval_snapshot.passed).toBe(true);
    expect(allPass.criteria_eval_snapshot.rules.map((entry) => entry.result.passed)).toEqual([true, true, true]);

    const oneFailInitiative = await initiative("execute");
    const oneFailBenefit = await benefit(oneFailInitiative.id);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "value"."benefit_baselines" (benefit_id, amount, currency, approved_at)
       VALUES ($1::uuid, 100, 'SAR', CURRENT_TIMESTAMP)`,
      oneFailBenefit.id,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "value"."value_state_entries" (benefit_id, state, amount, currency, period, source)
       VALUES ($1::uuid, 'realized', 95, 'SAR', '2026-08', 'manual')`,
      oneFailBenefit.id,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "execution"."risk_indicators" (initiative_id, level, source, locked)
       VALUES ($1::uuid, 'high', 'manual', false)`,
      oneFailInitiative.id,
    );
    const oneFailGate = await pendingGate(oneFailInitiative.id, "scale");
    const oneFail = await gates.evaluateCriteria(oneFailGate, ownerId) as { criteria_eval_snapshot: { passed: boolean; rules: Array<{ result: { passed: boolean } }> } };
    expect(oneFail.criteria_eval_snapshot.passed).toBe(false);
    expect(oneFail.criteria_eval_snapshot.rules.filter((entry) => !entry.result.passed)).toHaveLength(1);

    const allFailInitiative = await initiative("scale");
    await benefit(allFailInitiative.id);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "execution"."risk_indicators" (initiative_id, level, source, locked)
       VALUES ($1::uuid, 'high', 'manual', false)`,
      allFailInitiative.id,
    );
    const allFailGate = await pendingGate(allFailInitiative.id, "done");
    const allFail = await gates.evaluateCriteria(allFailGate, ownerId) as { criteria_eval_snapshot: { passed: boolean; rules: Array<{ result: { passed: boolean } }> } };
    expect(allFail.criteria_eval_snapshot.passed).toBe(false);
    expect(allFail.criteria_eval_snapshot.rules.map((entry) => entry.result.passed)).toEqual([false, false, false]);
  });

  it("makes programmatic auto-advance impossible and enforces separation of duties", async () => {
    const item = await initiative("pilot");
    const b = await benefit(item.id);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "value"."benefit_baselines" (benefit_id, amount, currency, approved_at)
       VALUES ($1::uuid, 100, 'SAR', CURRENT_TIMESTAMP)`,
      b.id,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "value"."value_state_entries" (benefit_id, state, amount, currency, period, source)
       VALUES ($1::uuid, 'realized', 100, 'SAR', '2026-08', 'manual')`,
      b.id,
    );
    const gateId = await pendingGate(item.id, "execute");
    await gates.evaluateCriteria(gateId, ownerId);

    await expect(prisma.$executeRawUnsafe(
      `UPDATE "value"."gate_reviews"
       SET decision = 'continue', decided_by = $2, decided_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid`,
      gateId,
      committeeId,
    )).rejects.toThrow(/human-only/);

    await expect(gates.decide({ gateReviewId: gateId, decision: "continue", decidedBy: ownerId }))
      .rejects.toMatchObject({ code: "VALUE_GATE_SEPARATION_OF_DUTIES" });

    await expect(gates.decide({ gateReviewId: gateId, decision: "continue", decidedBy: committeeId }))
      .resolves.toMatchObject({ decision: "continue", decided_by: committeeId });
  });

  it("creates corrective commentary work for intervene and closes initiative benefits for stop", async () => {
    const interveneInitiative = await initiative("execute");
    const interveneGate = await pendingGate(interveneInitiative.id, "scale");
    await prisma.$executeRawUnsafe(
      `UPDATE "value"."gate_reviews" SET criteria_eval_snapshot = '{"status":"evaluated","passed":false}'::jsonb WHERE id = $1::uuid`,
      interveneGate,
    );
    await gates.decide({ gateReviewId: interveneGate, decision: "intervene", decidedBy: committeeId });
    const corrective = await gates.getCorrectiveActionRequirement(interveneGate);
    expect(corrective).toMatchObject({ initiative_id: interveneInitiative.id, required_by: ownerId, status: "open" });

    const stoppedInitiative = await initiative("scale");
    const stoppedBenefit = await benefit(stoppedInitiative.id);
    const stopGate = await pendingGate(stoppedInitiative.id, "done");
    await prisma.$executeRawUnsafe(
      `UPDATE "value"."gate_reviews" SET criteria_eval_snapshot = '{"status":"evaluated","passed":false}'::jsonb WHERE id = $1::uuid`,
      stopGate,
    );
    await gates.decide({ gateReviewId: stopGate, decision: "stop", decidedBy: committeeId });

    const initiativeRows = await prisma.$queryRawUnsafe<Array<{ stage: string }>>(
      `SELECT stage::text FROM "execution"."initiatives" WHERE id = $1::uuid`,
      stoppedInitiative.id,
    );
    expect(initiativeRows[0]!.stage).toBe("done");
    const benefitRows = await prisma.$queryRawUnsafe<Array<{ lifecycle_state: string; workflow_snapshot: { context?: { stopReason?: string } } }>>(
      `SELECT lifecycle_state::text, workflow_snapshot FROM "value"."benefits" WHERE id = $1::uuid`,
      stoppedBenefit.id,
    );
    expect(benefitRows[0]!.lifecycle_state).toBe("closure");
    expect(benefitRows[0]!.workflow_snapshot.context?.stopReason).toContain("Value Gate");
  });
});
