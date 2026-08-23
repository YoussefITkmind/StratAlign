import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/database/prisma.service";
import { ExecutionService } from "../../src/modules/execution/execution.service";
import { AlignmentService } from "../../src/modules/registry/alignment.service";
import { KpiRegistryService } from "../../src/modules/registry/kpi-registry.service";
import { TraceabilityReadService } from "../../src/modules/traceability/traceability-read.service";
import { FakeApprovalGateway, FakeStrategyNodeGateway } from "./support/registry-fakes";

function applyMigrations(databaseUrl: string): void {
  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve("prisma/build/index.js");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}

describe.sequential("Phase 4.3 traceability read model", () => {
  let postgres: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let prisma: PrismaService;
  let execution: ExecutionService;
  let traceability: TraceabilityReadService;
  let kpis: KpiRegistryService;
  let alignments: AlignmentService;
  let approvals: FakeApprovalGateway;
  let strategyNodes: FakeStrategyNodeGateway;
  let actorId: string;
  let planVersionId: string;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer("postgres:17-alpine")
      .withDatabase("spm_traceability_test")
      .withUsername("spm_test")
      .withPassword("spm_test_password")
      .start();
    const databaseUrl = postgres.getConnectionUri();
    applyMigrations(databaseUrl);
    prisma = new PrismaService(databaseUrl);
    await prisma.connect();
    execution = new ExecutionService(prisma);
    traceability = new TraceabilityReadService(prisma);
  }, 180_000);

  afterAll(async () => {
    await prisma?.disconnect();
    await postgres?.stop();
  }, 60_000);

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE
      "performance"."status_results",
      "registry"."alignments",
      "registry"."kpi_versions",
      "registry"."kpi_definitions",
      "execution"."milestone_flags",
      "execution"."jira_links",
      "execution"."initiatives",
      "strategy"."owner_assignments",
      "strategy"."strategy_edges",
      "strategy"."strategy_nodes",
      "strategy"."plan_versions",
      "rules"."rule_definitions",
      "iam"."users"
      RESTART IDENTITY CASCADE`);
    const actor = await prisma.user.create({ data: { email: "traceability@example.test", displayName: "Traceability Owner" } });
    actorId = actor.id;
    const plan = await prisma.planVersion.create({ data: { name: "Traceability Plan", status: "ACTIVE" } });
    planVersionId = plan.id;
    approvals = new FakeApprovalGateway();
    strategyNodes = new FakeStrategyNodeGateway(true);
    kpis = new KpiRegistryService(prisma, approvals, strategyNodes);
    alignments = new AlignmentService(prisma, strategyNodes);
  });

  it("returns the persisted objective-to-execution chain and active-version KPI status deterministically", async () => {
    const objective = await prisma.strategyNode.create({
      data: { type: "OBJECTIVE", nameEn: "Growth", nameAr: "Growth", planVersionId, state: "ACTIVE", createdBy: actorId },
    });
    const [zetaPlay, alphaPlay, wrongPlay] = await Promise.all([
      prisma.strategyNode.create({ data: { type: "STRATEGIC_PLAY", nameEn: "Zeta play", nameAr: "Zeta play", planVersionId, state: "ACTIVE", createdBy: actorId } }),
      prisma.strategyNode.create({ data: { type: "STRATEGIC_PLAY", nameEn: "Alpha play", nameAr: "Alpha play", planVersionId, state: "ACTIVE", createdBy: actorId } }),
      prisma.strategyNode.create({ data: { type: "STRATEGIC_PLAY", nameEn: "Wrong play", nameAr: "Wrong play", planVersionId, state: "ACTIVE", createdBy: actorId } }),
    ]);
    await prisma.relationshipRule.create({ data: { fromType: "OBJECTIVE", toType: "STRATEGIC_PLAY", edgeType: "ALIGNS_TO" } });
    await prisma.strategyEdge.createMany({ data: [
      { fromNodeId: objective.id, toNodeId: zetaPlay.id, edgeType: "EXECUTED_BY", planVersionId },
      { fromNodeId: objective.id, toNodeId: alphaPlay.id, edgeType: "EXECUTED_BY", planVersionId },
      { fromNodeId: objective.id, toNodeId: wrongPlay.id, edgeType: "ALIGNS_TO", planVersionId },
    ] });
    await prisma.ownerAssignment.createMany({ data: [zetaPlay, alphaPlay].map((play) => ({ nodeId: play.id, ownerUserId: actorId, assignedBy: actorId })) });

    const initiativeZ = await execution.registerInitiative({
      nameEn: "Zeta initiative", nameAr: "Zeta initiative", strategicPlayNodeId: alphaPlay.id,
      ownerUserId: actorId, stage: "execute", actorUserId: actorId, actorIsSeoAdministrator: false,
    });
    const initiativeA = await execution.registerInitiative({
      nameEn: "Alpha initiative", nameAr: "Alpha initiative", strategicPlayNodeId: alphaPlay.id,
      ownerUserId: actorId, stage: "pilot", actorUserId: actorId, actorIsSeoAdministrator: false,
    });
    const jira = await execution.linkJira({
      initiativeId: initiativeA.id, jiraProjectKey: "TRACE", jiraProjectUrl: "https://jira.example.test/projects/TRACE",
      actorUserId: actorId, actorIsSeoAdministrator: false,
    });
    await execution.flagMilestone({
      jiraLinkId: jira.id, nameEn: "Later", nameAr: "Later", dueDate: new Date("2026-10-01T00:00:00Z"),
      health: "at_risk", source: "jira", actorUserId: actorId, actorIsSeoAdministrator: false,
    });
    await execution.flagMilestone({
      jiraLinkId: jira.id, nameEn: "Earlier", nameAr: "Earlier", dueDate: new Date("2026-09-01T00:00:00Z"),
      health: "on_time", source: "manual", actorUserId: actorId, actorIsSeoAdministrator: false,
    });

    strategyNodes.register(objective.id);
    const draft = await kpis.createDraft({
      nameEn: "Growth KPI", nameAr: "Growth KPI", unit: "%", polarity: "higher_is_better",
      frequency: "monthly", dataSourceType: "manual", ownerUserId: actorId, activeFrom: new Date("2026-01-01T00:00:00Z"),
    });
    approvals.approve("trace-case", draft.definition.id);
    const published = await kpis.publishVersion({ kpiVersionId: draft.version.id, approvalCaseId: "trace-case" });
    await alignments.set({
      kpiDefinitionId: published.definition.id,
      alignments: [{ strategyNodeId: objective.id, alignmentType: "objective" }],
    });
    const unpublished = await kpis.createDraft({
      nameEn: "No active KPI", nameAr: "No active KPI", unit: "count", polarity: "lower_is_better",
      frequency: "quarterly", dataSourceType: "manual", ownerUserId: actorId, activeFrom: new Date("2026-01-01T00:00:00Z"),
    });
    await alignments.set({
      kpiDefinitionId: unpublished.definition.id,
      alignments: [{ strategyNodeId: objective.id, alignmentType: "objective" }],
    });
    const statusRule = await prisma.ruleDefinition.create({
      data: {
        ruleKey: "trace-status", ruleType: "THRESHOLD_STATUS", name: "Trace status", documentJson: {},
        version: 1, status: "PUBLISHED", isCurrent: true, publishedAt: new Date(), createdById: actorId,
      },
    });
    await prisma.statusResult.createMany({ data: [
      { kpiVersionId: published.version.id, scopeNodeId: objective.id, period: "2026-07", status: "watch", computedAt: new Date("2026-08-01T00:00:00Z"), ruleVersionUsed: statusRule.id, dedupeKey: "trace-old" },
      { kpiVersionId: published.version.id, scopeNodeId: objective.id, period: "2026-08", status: "on_track", computedAt: new Date("2026-08-02T00:00:00Z"), ruleVersionUsed: statusRule.id, dedupeKey: "trace-new" },
    ] });

    const trace = await traceability.getFullTrace(objective.id);
    expect(trace.objective).toMatchObject({ id: objective.id, planVersionId });
    expect(trace.plays.map((play) => play.id)).toEqual([alphaPlay.id, zetaPlay.id]);
    expect(trace.plays.some((play) => play.id === wrongPlay.id)).toBe(false);
    expect(trace.plays[0]!.initiatives.map((initiative) => initiative.id)).toEqual([initiativeA.id, initiativeZ.id]);
    expect(trace.plays[0]!.initiatives[0]).toMatchObject({ jiraLink: { id: jira.id, jiraProjectKey: "TRACE" } });
    expect(trace.plays[0]!.initiatives[0]!.milestones.map((milestone) => milestone.nameEn)).toEqual(["Earlier", "Later"]);
    expect(trace.kpis.map((kpi) => kpi.kpiDefinitionId)).toEqual([
      published.definition.id,
      unpublished.definition.id,
    ]);
    expect(trace.kpis[0]).toEqual(expect.objectContaining({
      kpiDefinitionId: published.definition.id,
      alignmentType: "objective",
      activeVersion: expect.objectContaining({ versionId: published.version.id, nameEn: "Growth KPI" }),
      latestStatus: expect.objectContaining({ period: "2026-08", status: "on_track" }),
    }));
    expect(trace.kpis[1]).toMatchObject({
      kpiDefinitionId: unpublished.definition.id,
      activeVersion: null,
      latestStatus: null,
    });
  });

  it("returns empty branches for a valid objective and rejects a non-objective", async () => {
    const objective = await prisma.strategyNode.create({
      data: { type: "OBJECTIVE", nameEn: "Empty", nameAr: "Empty", planVersionId, state: "ACTIVE", createdBy: actorId },
    });
    await expect(traceability.getFullTrace(objective.id)).resolves.toMatchObject({
      objective: { id: objective.id }, plays: [], kpis: [],
    });
    await expect(traceability.getFullTrace("00000000-0000-4000-8000-000000000001"))
      .rejects.toThrow("Strategy objective not found");
  });
});
