import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/database/prisma.service";
import { EventBusService } from "../../src/events/event-bus.service";
import type { QueueService } from "../../src/queue/queue.service";
import { createLogger } from "../../src/logging/logger";
import { GovernanceService } from "../../src/modules/governance/governance.service";
import { MeasurementService } from "../../src/modules/performance/measurement.service";
import { RulesService } from "../../src/modules/rules/rules.service";
import { ScorecardService } from "../../src/modules/scorecard/scorecard.service";

function applyMigrations(databaseUrl: string): void {
  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve("prisma/build/index.js");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}

const noopQueueService = { enqueue: async () => undefined } as unknown as QueueService;

type PerspectiveFixture = { id: string; scorecardId: string };

describe.sequential("Scorecard module with PostgreSQL Testcontainers", () => {
  let postgres: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let prisma: PrismaService;
  let governance: GovernanceService;
  let rules: RulesService;
  let scorecard: ScorecardService;
  let submitterId: string;
  let approverId: string;
  let planVersionId: string;
  let scorecardId: string;
  let financialId: string;
  let customerId: string;
  let financialObjectiveId: string;
  let customerObjectiveId: string;
  let ragRuleId: string;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer("postgres:17-alpine")
      .withDatabase("spm_scorecard_test")
      .withUsername("spm_test")
      .withPassword("spm_test_password")
      .start();
    const databaseUrl = postgres.getConnectionUri();
    applyMigrations(databaseUrl);
    prisma = new PrismaService(databaseUrl);
    await prisma.connect();
    const logger = createLogger("error");
    const eventBus = new EventBusService(noopQueueService, logger.child("event-bus"));
    rules = new RulesService(prisma);
    governance = new GovernanceService(prisma, eventBus, rules);
    scorecard = new ScorecardService(
      prisma,
      governance,
      rules,
      new MeasurementService(prisma, eventBus, logger.child("scorecard-measurement")),
    );
  }, 180_000);

  afterAll(async () => {
    await prisma?.disconnect();
    await postgres?.stop();
  }, 60_000);

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE
      "scorecard"."map_links",
      "scorecard"."strategy_maps",
      "scorecard"."weighting_versions",
      "scorecard"."placements",
      "scorecard"."perspectives",
      "scorecard"."scorecards",
      "execution"."initiatives",
      "governance"."decision_log_entries",
      "governance"."escalation_cases",
      "governance"."approval_cases",
      "governance"."workflow_definitions",
      "performance"."rollup_results",
      "performance"."status_results",
      "registry"."alignments",
      "registry"."kpi_threshold_rule_bindings",
      "registry"."kpi_versions",
      "registry"."kpi_definitions",
      "rules"."rule_definitions",
      "strategy"."strategy_edges",
      "strategy"."owner_assignments",
      "strategy"."strategy_nodes",
      "strategy"."plan_versions",
      "public"."domain_events",
      "iam"."users"
      RESTART IDENTITY CASCADE`);

    const [submitter, approver] = await Promise.all([
      prisma.user.create({ data: { email: "scorecard-submitter@example.test", displayName: "Scorecard Submitter" } }),
      prisma.user.create({ data: { email: "scorecard-approver@example.test", displayName: "Scorecard Approver" } }),
    ]);
    submitterId = submitter.id;
    approverId = approver.id;

    const plan = await prisma.planVersion.create({ data: { name: "FY27", status: "ACTIVE" } });
    planVersionId = plan.id;

    const [financialObjective, customerObjective] = await Promise.all([
      prisma.strategyNode.create({ data: { type: "OBJECTIVE", nameEn: "Grow margin", nameAr: "تنمية الهامش", planVersionId, state: "ACTIVE", createdBy: submitterId } }),
      prisma.strategyNode.create({ data: { type: "OBJECTIVE", nameEn: "Improve loyalty", nameAr: "تحسين الولاء", planVersionId, state: "ACTIVE", createdBy: submitterId } }),
    ]);
    financialObjectiveId = financialObjective.id;
    customerObjectiveId = customerObjective.id;

    const ragRule = await prisma.ruleDefinition.create({
      data: {
        ruleKey: "scorecard-weighted-rag",
        ruleType: "RAG_AGGREGATION",
        name: "Weighted scorecard RAG",
        documentJson: { ruleType: "rag_aggregation", method: "weighted_count", watchThreshold: 0.3, offTrackThreshold: 0.7 },
        version: 1,
        status: "PUBLISHED",
        isCurrent: true,
        publishedAt: new Date(),
        createdById: submitterId,
      },
    });
    ragRuleId = ragRule.id;

    const created = await scorecard.createScorecard({
      nameEn: "Corporate Scorecard",
      nameAr: "بطاقة الأداء المؤسسية",
      planVersionId,
    });
    scorecardId = created.id;

    const perspectives = await prisma.$queryRaw<PerspectiveFixture[]>`
      INSERT INTO scorecard.perspectives (scorecard_id, name_en, name_ar, "order")
      VALUES
        (${scorecardId}::uuid, 'Financial', 'مالي', 0),
        (${scorecardId}::uuid, 'Customer', 'العملاء', 1)
      RETURNING id, scorecard_id AS "scorecardId"`;
    [financialId, customerId] = perspectives.map((perspective) => perspective.id);

    await scorecard.setPlacement({ perspectiveId: financialId, objectiveNodeId: financialObjectiveId });
    await scorecard.setPlacement({ perspectiveId: customerId, objectiveNodeId: customerObjectiveId });

    for (const fixture of [
      { objectiveId: financialObjectiveId, status: "off_track", name: "Margin KPI" },
      { objectiveId: customerObjectiveId, status: "on_track", name: "Loyalty KPI" },
    ]) {
      const definition = await prisma.kpiDefinition.create({ data: { status: "ACTIVE" } });
      const version = await prisma.kpiVersion.create({
        data: {
          kpiDefinitionId: definition.id,
          version: 1,
          nameEn: fixture.name,
          nameAr: fixture.name,
          unit: "%",
          polarity: "HIGHER_IS_BETTER",
          frequency: "MONTHLY",
          dataSourceType: "MANUAL",
          ownerUserId: submitterId,
          activeFrom: new Date("2026-08-01T00:00:00Z"),
          publishedAt: new Date("2026-08-01T00:00:00Z"),
        },
      });
      await prisma.kpiDefinition.update({ where: { id: definition.id }, data: { activeVersionId: version.id } });
      await prisma.alignment.create({ data: { kpiDefinitionId: definition.id, strategyNodeId: fixture.objectiveId, alignmentType: "OBJECTIVE" } });
      await prisma.statusResult.create({
        data: {
          kpiVersionId: version.id,
          scopeNodeId: fixture.objectiveId,
          period: "2026-Q3",
          status: fixture.status,
          ruleVersionUsed: ragRuleId,
          dedupeKey: `scorecard-status:${version.id}`,
        },
      });
      await prisma.rollupResult.create({
        data: {
          parentKpiId: definition.id,
          scopeNodeId: fixture.objectiveId,
          period: "2026-Q3",
          aggregatedValue: fixture.status === "off_track" ? 20 : 90,
          method: "average",
          ruleVersionUsed: ragRuleId,
          dedupeKey: `scorecard-rollup:${definition.id}`,
        },
      });
    }

    await prisma.$executeRaw`
      INSERT INTO scorecard.weighting_versions
        (scorecard_id, perspective_weights, scoring_formula_id, active_from)
      VALUES
        (${scorecardId}::uuid, ${JSON.stringify({ [financialId]: 50, [customerId]: 50 })}::jsonb,
         ${ragRuleId}, ${new Date("2026-08-01T00:00:00Z")})`;
  });

  it("computes the concrete weighting impact delta from current StatusResult data", async () => {
    const preview = await scorecard.previewWeighting({
      scorecardId,
      draftWeights: { [financialId]: 80, [customerId]: 20 },
    });

    expect(preview.currentScore).toBe(50);
    expect(preview.proposedScore).toBe(20);
    expect(preview.delta).toBe(-30);
    expect(preview.perspectiveStatuses).toEqual(expect.arrayContaining([
      expect.objectContaining({ perspectiveId: financialId, status: "off_track", currentStatusResultIds: [expect.any(String)], currentRollupResultIds: [expect.any(String)] }),
      expect.objectContaining({ perspectiveId: customerId, status: "on_track", currentStatusResultIds: [expect.any(String)], currentRollupResultIds: [expect.any(String)] }),
    ]));
  });

  it("aggregates all KPI statuses into an objective score using the active scorecard RAG rule", async () => {
    const definition = await prisma.kpiDefinition.create({
      data: { status: "ACTIVE" },
    });

    const version = await prisma.kpiVersion.create({
      data: {
        kpiDefinitionId: definition.id,
        version: 1,
        nameEn: "Margin resilience KPI",
        nameAr: "Margin resilience KPI",
        unit: "%",
        polarity: "HIGHER_IS_BETTER",
        frequency: "MONTHLY",
        dataSourceType: "MANUAL",
        ownerUserId: submitterId,
        activeFrom: new Date("2026-08-01T00:00:00Z"),
        publishedAt: new Date("2026-08-01T00:00:00Z"),
      },
    });

    await prisma.kpiDefinition.update({
      where: { id: definition.id },
      data: { activeVersionId: version.id },
    });

    await prisma.alignment.create({
      data: {
        kpiDefinitionId: definition.id,
        strategyNodeId: financialObjectiveId,
        alignmentType: "OBJECTIVE",
      },
    });

    await prisma.statusResult.create({
      data: {
        kpiVersionId: version.id,
        scopeNodeId: financialObjectiveId,
        period: "2026-Q3",
        status: "on_track",
        ruleVersionUsed: ragRuleId,
        dedupeKey: `scorecard-objective-score:${version.id}`,
      },
    });

    try {
      const details = await scorecard.listPlacementDetails(scorecardId);

      expect(details).toEqual(expect.arrayContaining([
        expect.objectContaining({
          objectiveNodeId: financialObjectiveId,
          status: "watch",
          score: 50,
        }),
        expect.objectContaining({
          objectiveNodeId: customerObjectiveId,
          status: "on_track",
          score: 100,
        }),
      ]));
    } finally {
      await prisma.statusResult.deleteMany({
        where: { kpiVersionId: version.id },
      });

      await prisma.alignment.deleteMany({
        where: { kpiDefinitionId: definition.id },
      });
    }
  });
  it("returns objective score trend from persisted status periods", async () => {
    const alignment = await prisma.alignment.findFirst({
      where: { strategyNodeId: financialObjectiveId },
      select: {
        kpiDefinition: {
          select: { activeVersionId: true },
        },
      },
    });

    const activeVersionId = alignment?.kpiDefinition.activeVersionId;
    if (!activeVersionId) throw new Error("Expected an active KPI version");

    const historicalStatus = await prisma.statusResult.create({
      data: {
        kpiVersionId: activeVersionId,
        scopeNodeId: financialObjectiveId,
        period: "2026-Q2",
        status: "on_track",
        computedAt: new Date("2026-07-01T00:00:00Z"),
        ruleVersionUsed: ragRuleId,
        dedupeKey: `scorecard-objective-trend:${activeVersionId}:2026-Q2`,
      },
    });

    try {
      const details = await scorecard.listPlacementDetails(scorecardId);

      expect(details).toEqual(expect.arrayContaining([
        expect.objectContaining({
          objectiveNodeId: financialObjectiveId,
          trend: [
            { period: "2026-Q2", score: 100 },
            { period: "2026-Q3", score: 0 },
          ],
        }),
      ]));
    } finally {
      await prisma.statusResult.delete({
        where: { id: historicalStatus.id },
      });
    }
  });
  it("returns historical score trend using the current weighting across persisted status periods", async () => {
    const alignments = await prisma.alignment.findMany({
      where: {
        strategyNodeId: {
          in: [financialObjectiveId, customerObjectiveId],
        },
      },
      select: {
        strategyNodeId: true,
        kpiDefinition: {
          select: {
            activeVersionId: true,
          },
        },
      },
    });

    for (const alignment of alignments) {
      const activeVersionId = alignment.kpiDefinition.activeVersionId;
      if (!activeVersionId) throw new Error("Expected an active KPI version");

      await prisma.statusResult.create({
        data: {
          kpiVersionId: activeVersionId,
          scopeNodeId: alignment.strategyNodeId,
          period: "2026-Q2",
          status: "on_track",
          ruleVersionUsed: ragRuleId,
          dedupeKey: `scorecard-trend-status:${activeVersionId}:2026-Q2`,
        },
      });
    }

    const trend = await scorecard.scoreTrend(scorecardId);

    expect(trend).toEqual([
      { period: "2026-Q2", score: 100 },
      { period: "2026-Q3", score: 50 },
    ]);
  });
  it("derives objective progress from effective measurements, targets, polarity, and all aligned KPIs", async () => {
    const financialAlignment = await prisma.alignment.findFirstOrThrow({
      where: { strategyNodeId: financialObjectiveId },
      include: { kpiDefinition: { include: { activeVersion: true } } },
    });
    const financialVersion = financialAlignment.kpiDefinition.activeVersion!;

    await prisma.targetSeries.create({
      data: {
        kpiVersionId: financialVersion.id,
        scopeNodeId: financialObjectiveId,
        period: "2026-Q3",
        targetValue: 100,
        planVersionId,
      },
    });
    const original = await prisma.measurement.create({
      data: {
        kpiVersionId: financialVersion.id,
        scopeNodeId: financialObjectiveId,
        period: "2026-Q3",
        value: 20,
        source: "MANUAL",
        submittedById: submitterId,
      },
    });
    await prisma.measurement.create({
      data: {
        kpiVersionId: financialVersion.id,
        scopeNodeId: financialObjectiveId,
        period: "2026-Q3",
        value: 60,
        source: "MANUAL",
        submittedById: submitterId,
        supersedesId: original.id,
      },
    });

    const lowerDefinition = await prisma.kpiDefinition.create({ data: { status: "ACTIVE" } });
    const lowerVersion = await prisma.kpiVersion.create({
      data: {
        kpiDefinitionId: lowerDefinition.id,
        version: 1,
        nameEn: "Cost KPI",
        nameAr: "Cost KPI",
        unit: "USD",
        polarity: "LOWER_IS_BETTER",
        frequency: "MONTHLY",
        dataSourceType: "MANUAL",
        ownerUserId: submitterId,
        activeFrom: new Date("2026-08-01T00:00:00Z"),
        publishedAt: new Date("2026-08-01T00:00:00Z"),
      },
    });
    await prisma.kpiDefinition.update({ where: { id: lowerDefinition.id }, data: { activeVersionId: lowerVersion.id } });
    await prisma.alignment.create({ data: { kpiDefinitionId: lowerDefinition.id, strategyNodeId: financialObjectiveId, alignmentType: "OBJECTIVE" } });
    await prisma.statusResult.create({
      data: {
        kpiVersionId: lowerVersion.id,
        scopeNodeId: financialObjectiveId,
        period: "2026-Q3",
        status: "watch",
        ruleVersionUsed: ragRuleId,
        dedupeKey: `scorecard-progress:${lowerVersion.id}`,
      },
    });
    await prisma.targetSeries.create({
      data: { kpiVersionId: lowerVersion.id, scopeNodeId: financialObjectiveId, period: "2026-Q3", targetValue: 10, planVersionId },
    });
    await prisma.measurement.create({
      data: { kpiVersionId: lowerVersion.id, scopeNodeId: financialObjectiveId, period: "2026-Q3", value: 20, source: "MANUAL", submittedById: submitterId },
    });

    let details = await scorecard.listPlacementDetails(scorecardId);
    expect(details.find((row) => row.objectiveNodeId === financialObjectiveId)?.progress).toBe(55);
    expect(details.find((row) => row.objectiveNodeId === customerObjectiveId)?.progress).toBeNull();

    const customerAlignment = await prisma.alignment.findFirstOrThrow({
      where: { strategyNodeId: customerObjectiveId },
      include: { kpiDefinition: { include: { activeVersion: true } } },
    });
    const customerVersion = customerAlignment.kpiDefinition.activeVersion!;
    await prisma.targetSeries.create({
      data: { kpiVersionId: customerVersion.id, scopeNodeId: customerObjectiveId, period: "2026-Q3", targetValue: 0, planVersionId },
    });
    await prisma.measurement.create({
      data: { kpiVersionId: customerVersion.id, scopeNodeId: customerObjectiveId, period: "2026-Q3", value: 0, source: "MANUAL", submittedById: submitterId },
    });
    details = await scorecard.listPlacementDetails(scorecardId);
    expect(details.find((row) => row.objectiveNodeId === customerObjectiveId)?.progress).toBeNull();

    await prisma.targetSeries.updateMany({
      where: { kpiVersionId: customerVersion.id, scopeNodeId: customerObjectiveId },
      data: { targetValue: 50 },
    });
    await prisma.measurement.updateMany({
      where: { kpiVersionId: customerVersion.id, scopeNodeId: customerObjectiveId },
      data: { value: 75 },
    });
    details = await scorecard.listPlacementDetails(scorecardId);
    expect(details.find((row) => row.objectiveNodeId === customerObjectiveId)?.progress).toBe(100);
  });
  it("exposes persisted Strategy Map objective properties without duplicating score semantics", async () => {
    await prisma.ownerAssignment.create({
      data: { nodeId: financialObjectiveId, ownerUserId: approverId, assignedBy: submitterId },
    });
    const play = await prisma.strategyNode.create({
      data: {
        type: "STRATEGIC_PLAY",
        nameEn: "Margin transformation",
        nameAr: "Margin transformation",
        planVersionId,
        state: "ACTIVE",
        createdBy: submitterId,
      },
    });
    await prisma.strategyEdge.create({
      data: {
        fromNodeId: financialObjectiveId,
        toNodeId: play.id,
        edgeType: "EXECUTED_BY",
        planVersionId,
      },
    });
    await prisma.initiative.createMany({
      data: [
        { nameEn: "Pricing", nameAr: "Pricing", strategicPlayNodeId: play.id, ownerUserId: approverId, stage: "DESIGN" },
        { nameEn: "Sourcing", nameAr: "Sourcing", strategicPlayNodeId: play.id, ownerUserId: approverId, stage: "PILOT" },
      ],
    });

    const details = await scorecard.listPlacementDetails(scorecardId);
    const financial = details.find((row) => row.objectiveNodeId === financialObjectiveId);
    const customer = details.find((row) => row.objectiveNodeId === customerObjectiveId);

    expect(financial).toMatchObject({
      perspective: { id: financialId, nameEn: "Financial", nameAr: expect.any(String) },
      owners: [{ id: approverId, displayName: "Scorecard Approver", email: "scorecard-approver@example.test" }],
      score: 0,
      kpiCount: 1,
      initiativeCount: 2,
    });
    expect(customer).toMatchObject({ owners: [], score: 100, kpiCount: 1, initiativeCount: 0 });
  });
  it("requires an approved workflow case for a structural perspective change", async () => {
    await expect(scorecard.addPerspective({
      scorecardId,
      nameEn: "Learning",
      nameAr: "التعلم",
      order: 2,
      approvalCaseId: "33333333-3333-4333-8333-333333333333",
    })).rejects.toMatchObject({ code: "SCORECARD_APPROVAL_REQUIRED" });

    const approval = await governance.submitCase({
      entityType: "scorecard_perspective",
      entityId: scorecardId,
      submittedBy: submitterId,
      approvalParticipantId: approverId,
      proposedChange: { before: null, after: { nameEn: "Learning", nameAr: "التعلم", order: 2 } },
    });
    await governance.transition({ caseId: approval.id, event: { type: "APPROVE", actorUserId: approverId, rationale: "Approved for test" } });

    const added = await scorecard.addPerspective({
      scorecardId,
      nameEn: "Learning",
      nameAr: "التعلم",
      order: 2,
      approvalCaseId: approval.id,
    });
    expect(added.nameEn).toBe("Learning");
  });

  it("rejects placement when an objective does not exist or is not active", async () => {
    await expect(scorecard.setPlacement({
      perspectiveId: financialId,
      objectiveNodeId: "44444444-4444-4444-8444-444444444444",
    })).rejects.toMatchObject({ code: "SCORECARD_OBJECTIVE_INVALID" });

    const draftObjective = await prisma.strategyNode.create({
      data: { type: "OBJECTIVE", nameEn: "Draft objective", nameAr: "هدف مسودة", planVersionId, state: "DRAFT", createdBy: submitterId },
    });
    await expect(scorecard.setPlacement({ perspectiveId: financialId, objectiveNodeId: draftObjective.id }))
      .rejects.toMatchObject({ code: "SCORECARD_OBJECTIVE_INVALID" });
  });
});
