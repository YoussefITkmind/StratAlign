import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../../src/database/prisma.service";
import { GovernanceService } from "../../src/modules/governance/governance.service";
import { PortfolioService } from "../../src/modules/portfolio/portfolio.service";
import { RulesService } from "../../src/modules/rules/rules.service";
import { StrategyActivationService } from "../../src/modules/strategy/strategy-activation.service";
import { StrategyApprovalSubscriber } from "../../src/modules/strategy/strategy-approval.subscriber";
import { StrategyService } from "../../src/modules/strategy/strategy.service";

function migrate(databaseUrl: string) {
  const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "test", DATABASE_URL: databaseUrl }, stdio: "pipe" });
}

describe.sequential("Phase 4.6 portfolio hierarchy import", () => {
  let postgres: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let prisma: PrismaService;
  let strategy: StrategyService;
  let governance: GovernanceService;
  let portfolio: PortfolioService;
  let eventBus: { publishWithin: ReturnType<typeof vi.fn>; nudgeRelay: ReturnType<typeof vi.fn> };
  let planId: string;
  let submitterId: string;
  let approverId: string;
  let exactPlayId: string;
  let secondPlayId: string;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer("postgres:17-alpine").withDatabase("spm_portfolio_import_test").withUsername("spm_test").withPassword("spm_test_password").start();
    migrate(postgres.getConnectionUri());
    prisma = new PrismaService(postgres.getConnectionUri());
    await prisma.connect();
  }, 180_000);

  afterAll(async () => { await prisma?.disconnect(); await postgres?.stop(); }, 60_000);

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE strategy.portfolio_hierarchy_imports, strategy.staged_changes, strategy.strategy_edges, strategy.strategy_nodes, strategy.plan_versions, governance.decision_log_entries, governance.approval_cases, governance.workflow_definitions, iam.users RESTART IDENTITY CASCADE`);
    const submitter = await prisma.user.create({ data: { email: `submitter-${randomUUID()}@example.test`, displayName: "Submitter" } });
    const approver = await prisma.user.create({ data: { email: `approver-${randomUUID()}@example.test`, displayName: "Approver" } });
    submitterId = submitter.id;
    approverId = approver.id;
    planId = (await prisma.planVersion.create({ data: { name: "Active workshop plan", status: "ACTIVE" } })).id;
    exactPlayId = (await prisma.strategyNode.create({ data: { type: "STRATEGIC_PLAY", nameEn: "Customer Platform", nameAr: "منصة العملاء", planVersionId: planId, state: "ACTIVE", createdBy: submitterId } })).id;
    secondPlayId = (await prisma.strategyNode.create({ data: { type: "STRATEGIC_PLAY", nameEn: "Customer Experience", nameAr: "تجربة العملاء", planVersionId: planId, state: "ACTIVE", createdBy: submitterId } })).id;
    eventBus = { publishWithin: vi.fn().mockResolvedValue(1), nudgeRelay: vi.fn().mockResolvedValue(undefined) };
    strategy = new StrategyService(prisma);
    governance = new GovernanceService(prisma, eventBus as never);
    portfolio = new PortfolioService(prisma, new RulesService(prisma), governance, strategy);
  });

  const json = (plays: Array<{ id?: string; name?: string }>) => Buffer.from(JSON.stringify({ portfolios: [{ nameEn: "Growth", nameAr: "النمو", areasOfFocus: [{ nameEn: "Digital", nameAr: "الرقمية", plays }] }] }));
  const hierarchyJson = (areasOfFocus: Array<{ nameEn: string; nameAr: string; plays: Array<{ id?: string; name?: string }> }>) => Buffer.from(JSON.stringify({ portfolios: [{ nameEn: "Growth", nameAr: "النمو", areasOfFocus }] }));

  it("normalizes CSV and JSON, resolves exact matches, and retains fuzzy and unresolved references", async () => {
    const csv = Buffer.from(`portfolio_name_en,portfolio_name_ar,aof_name_en,aof_name_ar,play_id,play_name\nGrowth,النمو,Digital,الرقمية,${exactPlayId},\n`);
    const csvDiff = await portfolio.importHierarchyDryRun({ bytes: csv, format: "csv", planVersionId: planId, fileName: "workshop.csv", actorUserId: submitterId });
    expect(csvDiff.initialDiff.mappings[0]).toMatchObject({ resolution: "exact_id", resolvedPlayId: exactPlayId });
    expect(csvDiff.readyToCommit).toBe(true);

    const jsonDiff = await portfolio.importHierarchyDryRun({ bytes: json([{ name: "Customer Platform" }]), format: "json", planVersionId: planId, actorUserId: submitterId });
    expect(jsonDiff.initialDiff.mappings[0]).toMatchObject({ resolution: "exact_name", resolvedPlayId: exactPlayId });
    expect(jsonDiff.initialDiff.nodes.map((node) => node.type)).toEqual(["portfolio", "area_of_focus"]);

    const review = await portfolio.importHierarchyDryRun({ bytes: json([{ name: "Customer Platfrm" }, { name: "No Similar Reference ZZZ" }]), format: "json", planVersionId: planId, actorUserId: submitterId });
    expect(review.initialDiff.mappings[0]?.resolution).toBe("fuzzy");
    expect(review.initialDiff.mappings[0]?.resolvedPlayId).toBeUndefined();
    expect(review.initialDiff.mappings[0]?.candidates).toContainEqual(expect.objectContaining({ id: exactPlayId }));
    expect(review.initialDiff.mappings[1]).toMatchObject({ resolution: "unresolved", candidates: [] });
    expect(review.initialDiff.mappings).toHaveLength(2);
    expect(review.readyToCommit).toBe(false);

    const first = review.initialDiff.mappings[0]!;
    const second = review.initialDiff.mappings[1]!;
    await portfolio.resolveHierarchyMatch({ diffId: review.diffId, mappingId: first.mappingId, playId: exactPlayId });
    const resolved = await portfolio.resolveHierarchyMatch({ diffId: review.diffId, mappingId: second.mappingId, playId: exactPlayId });
    expect(resolved.resolutions).toMatchObject({ [first.mappingId]: exactPlayId, [second.mappingId]: exactPlayId });
    expect(resolved.reviewedMappings.every((mapping) => mapping.selectedPlayId === exactPlayId)).toBe(true);
    expect(resolved.readyToCommit).toBe(true);
  });

  it("flags additive-only reassignment conflicts and refuses commit", async () => {
    const oldArea = await prisma.strategyNode.create({ data: { type: "AREA_OF_FOCUS", nameEn: "Existing Area", nameAr: "مجال قائم", planVersionId: planId, state: "ACTIVE", createdBy: submitterId } });
    await prisma.strategyEdge.create({ data: { fromNodeId: exactPlayId, toNodeId: oldArea.id, edgeType: "BELONGS_TO_PORTFOLIO", planVersionId: planId } });
    const diff = await portfolio.importHierarchyDryRun({ bytes: json([{ id: exactPlayId }]), format: "json", planVersionId: planId, actorUserId: submitterId });
    expect(diff.initialDiff.mappings[0]?.conflict).toMatch(/different Area of Focus/);
    expect(diff.readyToCommit).toBe(false);
    await expect(portfolio.commitHierarchyImport({ diffId: diff.diffId, approvalParticipantId: approverId, actorUserId: submitterId })).rejects.toThrow(/different Area of Focus/);
    expect(diff.initialDiff.edges.every((edge) => edge.edgeType !== ("edge_unlink" as never))).toBe(true);
  });

  it("rejects one manually selected play mapped to two different Areas of Focus before Governance", async () => {
    const diff = await portfolio.importHierarchyDryRun({
      bytes: hierarchyJson([
        { nameEn: "Digital", nameAr: "الرقمية", plays: [{ name: "Unresolved Alpha ZZZ" }] },
        { nameEn: "Channels", nameAr: "القنوات", plays: [{ name: "Unresolved Beta ZZZ" }] },
      ]),
      format: "json",
      planVersionId: planId,
      actorUserId: submitterId,
    });
    const [first, second] = diff.initialDiff.mappings;
    await portfolio.resolveHierarchyMatch({ diffId: diff.diffId, mappingId: first!.mappingId, playId: exactPlayId });
    const reviewed = await portfolio.resolveHierarchyMatch({ diffId: diff.diffId, mappingId: second!.mappingId, playId: exactPlayId });
    expect(reviewed.readyToCommit).toBe(false);
    await expect(portfolio.commitHierarchyImport({ diffId: diff.diffId, approvalParticipantId: approverId, actorUserId: submitterId })).rejects.toThrow(`Resolved play ${exactPlayId} is mapped to conflicting Areas of Focus in the reviewed import`);
    expect(await prisma.approvalCase.count()).toBe(0);
    expect(await prisma.stagedChange.count()).toBe(0);
  });

  it("makes getDiff unready and rejects commit when a reused AoF gains another Portfolio parent", async () => {
    const area = await prisma.strategyNode.create({ data: { type: "AREA_OF_FOCUS", nameEn: "Digital", nameAr: "الرقمية", planVersionId: planId, state: "ACTIVE", createdBy: submitterId } });
    const diff = await portfolio.importHierarchyDryRun({ bytes: json([]), format: "json", planVersionId: planId, actorUserId: submitterId });
    expect(diff.readyToCommit).toBe(true);
    const otherPortfolio = await prisma.strategyNode.create({ data: { type: "PORTFOLIO", nameEn: "Other Portfolio", nameAr: "محفظة أخرى", planVersionId: planId, state: "ACTIVE", createdBy: submitterId } });
    await prisma.strategyEdge.create({ data: { fromNodeId: otherPortfolio.id, toNodeId: area.id, edgeType: "CONTAINS", planVersionId: planId } });
    const refreshed = await portfolio.getHierarchyDiff(diff.diffId);
    expect(refreshed.readyToCommit).toBe(false);
    await expect(portfolio.commitHierarchyImport({ diffId: diff.diffId, approvalParticipantId: approverId, actorUserId: submitterId })).rejects.toThrow(`Area of Focus ${area.id} already belongs to a different Portfolio`);
    expect(await prisma.approvalCase.count()).toBe(0);
    expect(await prisma.stagedChange.count()).toBe(0);
  });

  it("reuses an exact staged hierarchy row after the import reference update was missed, but rejects identity drift", async () => {
    const diff = await portfolio.importHierarchyDryRun({ bytes: json([{ id: exactPlayId }]), format: "json", planVersionId: planId, actorUserId: submitterId });
    const stagedChangeId = randomUUID();
    const approval = await governance.createCase({ entityType: "StrategyStagedChange", entityId: stagedChangeId, submittedBy: submitterId, approvalParticipantId: approverId, proposedChange: { before: null, after: { diffId: diff.diffId } } });
    await prisma.portfolioHierarchyImport.update({ where: { id: diff.diffId }, data: { approvalCaseId: approval.id, stagedChangeId: null } });
    await strategy.stageHierarchyImport({ stagedChangeId, approvalCaseId: approval.id, planVersionId: planId, diffId: diff.diffId, nodes: diff.initialDiff.nodes, edges: diff.initialDiff.edges, actorUserId: submitterId });

    const resumed = await portfolio.commitHierarchyImport({ diffId: diff.diffId, approvalParticipantId: approverId, actorUserId: submitterId });
    expect(resumed).toMatchObject({ stagedChangeId, approvalCaseId: approval.id, governanceState: "pending_approval" });
    expect(await prisma.stagedChange.count({ where: { id: stagedChangeId } })).toBe(1);
    expect(await prisma.approvalCase.count()).toBe(1);

    await expect(strategy.stageHierarchyImport({ stagedChangeId, approvalCaseId: approval.id, planVersionId: planId, diffId: diff.diffId, nodes: diff.initialDiff.nodes, edges: diff.initialDiff.edges.slice(0, 1), actorUserId: submitterId })).rejects.toThrow(/conflicts with the requested hierarchy import/);
    await expect(strategy.stageHierarchyImport({ stagedChangeId, approvalCaseId: randomUUID(), planVersionId: planId, diffId: diff.diffId, nodes: diff.initialDiff.nodes, edges: diff.initialDiff.edges, actorUserId: submitterId })).rejects.toThrow(/conflicts with the requested hierarchy import/);
    await expect(strategy.stageHierarchyImport({ stagedChangeId, approvalCaseId: approval.id, planVersionId: planId, diffId: diff.diffId, nodes: diff.initialDiff.nodes, edges: diff.initialDiff.edges, actorUserId: approverId })).rejects.toThrow(/conflicts with the requested hierarchy import/);
    await prisma.stagedChange.update({ where: { id: stagedChangeId }, data: { kind: "EDGE_LINK" } });
    await expect(strategy.stageHierarchyImport({ stagedChangeId, approvalCaseId: approval.id, planVersionId: planId, diffId: diff.diffId, nodes: diff.initialDiff.nodes, edges: diff.initialDiff.edges, actorUserId: submitterId })).rejects.toThrow(/conflicts with the requested hierarchy import/);
    await prisma.stagedChange.update({ where: { id: stagedChangeId }, data: { kind: "HIERARCHY_IMPORT" } });
    await prisma.stagedChange.update({ where: { id: stagedChangeId }, data: { status: "CANCELLED" } });
    await expect(strategy.stageHierarchyImport({ stagedChangeId, approvalCaseId: approval.id, planVersionId: planId, diffId: diff.diffId, nodes: diff.initialDiff.nodes, edges: diff.initialDiff.edges, actorUserId: submitterId })).rejects.toThrow(/conflicts with the requested hierarchy import/);
    await prisma.stagedChange.update({ where: { id: stagedChangeId }, data: { status: "APPLIED" } });
    await expect(strategy.stageHierarchyImport({ stagedChangeId, approvalCaseId: approval.id, planVersionId: planId, diffId: diff.diffId, nodes: diff.initialDiff.nodes, edges: diff.initialDiff.edges, actorUserId: submitterId })).rejects.toThrow(/conflicts with the requested hierarchy import/);
    await prisma.stagedChange.update({ where: { id: stagedChangeId }, data: { status: "PENDING" } });
    const otherPlan = await prisma.planVersion.create({ data: { name: "Other active plan", status: "DRAFT" } });
    await prisma.planVersion.update({ where: { id: planId }, data: { status: "CLOSED" } });
    await prisma.planVersion.update({ where: { id: otherPlan.id }, data: { status: "ACTIVE" } });
    await expect(strategy.stageHierarchyImport({ stagedChangeId, approvalCaseId: approval.id, planVersionId: otherPlan.id, diffId: diff.diffId, nodes: diff.initialDiff.nodes, edges: diff.initialDiff.edges, actorUserId: submitterId })).rejects.toThrow(/conflicts with the requested hierarchy import/);
  });

  it("rolls back the Governance case, staged row, and import references when staging fails", async () => {
    const diff = await portfolio.importHierarchyDryRun({ bytes: json([{ id: exactPlayId }]), format: "json", planVersionId: planId, actorUserId: submitterId });
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION strategy.reject_test_hierarchy_stage() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.kind = 'hierarchy_import' THEN RAISE EXCEPTION 'test hierarchy staging failure'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER reject_test_hierarchy_stage BEFORE INSERT ON strategy.staged_changes
      FOR EACH ROW EXECUTE FUNCTION strategy.reject_test_hierarchy_stage();
    `);
    try {
      await expect(portfolio.commitHierarchyImport({ diffId: diff.diffId, approvalParticipantId: approverId, actorUserId: submitterId })).rejects.toThrow(/test hierarchy staging failure/);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS reject_test_hierarchy_stage ON strategy.staged_changes; DROP FUNCTION IF EXISTS strategy.reject_test_hierarchy_stage()`);
    }
    expect(await prisma.approvalCase.count()).toBe(0);
    expect(await prisma.stagedChange.count({ where: { kind: "HIERARCHY_IMPORT" } })).toBe(0);
    expect(await prisma.portfolioHierarchyImport.findUnique({ where: { id: diff.diffId } })).toMatchObject({ approvalCaseId: null, stagedChangeId: null, status: "DRY_RUN" });
  });

  it("serializes concurrent commits and returns the same durable workflow", async () => {
    const diff = await portfolio.importHierarchyDryRun({ bytes: json([{ id: exactPlayId }]), format: "json", planVersionId: planId, actorUserId: submitterId });
    const [first, second] = await Promise.all([
      portfolio.commitHierarchyImport({ diffId: diff.diffId, approvalParticipantId: approverId, actorUserId: submitterId }),
      portfolio.commitHierarchyImport({ diffId: diff.diffId, approvalParticipantId: approverId, actorUserId: submitterId }),
    ]);
    expect(second).toMatchObject({ approvalCaseId: first.approvalCaseId, stagedChangeId: first.stagedChangeId });
    expect(await prisma.approvalCase.count({ where: { entityType: "StrategyStagedChange", entityId: first.stagedChangeId } })).toBe(1);
    expect(await prisma.stagedChange.count({ where: { id: first.stagedChangeId, kind: "HIERARCHY_IMPORT" } })).toBe(1);
    expect(await prisma.portfolioHierarchyImport.findUnique({ where: { id: diff.diffId } })).toMatchObject({ approvalCaseId: first.approvalCaseId, stagedChangeId: first.stagedChangeId, status: "SUBMITTED" });
  });

  it("merges simultaneous resolutions for different mappings without losing either update", async () => {
    const diff = await portfolio.importHierarchyDryRun({ bytes: json([{ name: "Unresolved Alpha ZZZ" }, { name: "Unresolved Beta ZZZ" }]), format: "json", planVersionId: planId, actorUserId: submitterId });
    const [first, second] = diff.initialDiff.mappings;
    await Promise.all([
      portfolio.resolveHierarchyMatch({ diffId: diff.diffId, mappingId: first!.mappingId, playId: exactPlayId }),
      portfolio.resolveHierarchyMatch({ diffId: diff.diffId, mappingId: second!.mappingId, playId: secondPlayId }),
    ]);
    const refreshed = await portfolio.getHierarchyDiff(diff.diffId);
    expect(refreshed.resolutions).toMatchObject({ [first!.mappingId]: exactPlayId, [second!.mappingId]: secondPlayId });
  });

  it("retains an atomic DRAFT workflow when submit fails and resumes the same IDs on retry", async () => {
    const diff = await portfolio.importHierarchyDryRun({ bytes: json([{ name: "Unresolved Freeze ZZZ" }]), format: "json", planVersionId: planId, actorUserId: submitterId });
    const mapping = diff.initialDiff.mappings[0]!;
    await portfolio.resolveHierarchyMatch({ diffId: diff.diffId, mappingId: mapping.mappingId, playId: exactPlayId });
    const transition = vi.spyOn(governance, "transition").mockRejectedValueOnce(new Error("test submit failure"));
    await expect(portfolio.commitHierarchyImport({ diffId: diff.diffId, approvalParticipantId: approverId, actorUserId: submitterId })).rejects.toThrow(/test submit failure/);
    transition.mockRestore();
    const retained = await prisma.portfolioHierarchyImport.findUnique({ where: { id: diff.diffId } });
    expect(retained).toMatchObject({ status: "DRY_RUN" });
    expect(retained?.approvalCaseId).toBeTruthy();
    expect(retained?.stagedChangeId).toBeTruthy();
    expect(await prisma.approvalCase.findUnique({ where: { id: retained!.approvalCaseId! } })).toMatchObject({ currentState: "DRAFT", entityId: retained!.stagedChangeId });
    expect((retained!.resolutions as Record<string, string>)[mapping.mappingId]).toBe(exactPlayId);
    const staged = await prisma.stagedChange.findUnique({ where: { id: retained!.stagedChangeId! } });
    expect(staged?.payload).toMatchObject({ edges: expect.arrayContaining([expect.objectContaining({ fromNodeId: exactPlayId, toNodeId: mapping.areaOfFocusId, edgeType: "belongs_to_portfolio" })]) });
    expect((await portfolio.getHierarchyDiff(diff.diffId)).readyToCommit).toBe(false);
    await expect(portfolio.resolveHierarchyMatch({ diffId: diff.diffId, mappingId: mapping.mappingId, playId: secondPlayId })).rejects.toThrow(/unfrozen dry-run/);
    expect(((await prisma.portfolioHierarchyImport.findUnique({ where: { id: diff.diffId } }))!.resolutions as Record<string, string>)[mapping.mappingId]).toBe(exactPlayId);

    const resumed = await portfolio.commitHierarchyImport({ diffId: diff.diffId, approvalParticipantId: approverId, actorUserId: submitterId });
    expect(resumed).toMatchObject({ approvalCaseId: retained!.approvalCaseId, stagedChangeId: retained!.stagedChangeId, governanceState: "pending_approval" });
    expect(await prisma.approvalCase.count()).toBe(1);
    expect(await prisma.stagedChange.count()).toBe(1);
  });

  it("stages one governed change, leaves the graph unchanged, then activates atomically and idempotently", async () => {
    const diff = await portfolio.importHierarchyDryRun({ bytes: json([{ id: exactPlayId }]), format: "json", planVersionId: planId, actorUserId: submitterId });
    const beforeNodes = await prisma.strategyNode.count({ where: { planVersionId: planId } });
    const beforeEdges = await prisma.strategyEdge.count({ where: { planVersionId: planId } });
    const committed = await portfolio.commitHierarchyImport({ diffId: diff.diffId, approvalParticipantId: approverId, actorUserId: submitterId });
    expect(committed.governanceState).toBe("pending_approval");
    const staged = await prisma.stagedChange.findMany({ where: { approvalCaseId: committed.approvalCaseId } });
    expect(staged).toHaveLength(1);
    expect(staged[0]).toMatchObject({ id: committed.stagedChangeId, kind: "HIERARCHY_IMPORT", status: "PENDING" });
    expect(await prisma.approvalCase.findUnique({ where: { id: committed.approvalCaseId } })).toMatchObject({ entityType: "StrategyStagedChange", entityId: committed.stagedChangeId, currentState: "PENDING_APPROVAL" });
    expect(await prisma.strategyNode.count({ where: { planVersionId: planId } })).toBe(beforeNodes);
    expect(await prisma.strategyEdge.count({ where: { planVersionId: planId } })).toBe(beforeEdges);
    await expect(portfolio.commitHierarchyImport({ diffId: diff.diffId, approvalParticipantId: approverId, actorUserId: submitterId })).resolves.toMatchObject({ stagedChangeId: committed.stagedChangeId, approvalCaseId: committed.approvalCaseId, governanceState: "pending_approval" });
    expect(await prisma.stagedChange.count({ where: { approvalCaseId: committed.approvalCaseId } })).toBe(1);

    await governance.transition({ caseId: committed.approvalCaseId, event: { type: "APPROVE", actorUserId: approverId } });
    const subscriber = new StrategyApprovalSubscriber(new StrategyActivationService(prisma, eventBus as never));
    const envelope = { eventId: randomUUID(), eventType: "governance.approval.granted", eventVersion: 1, aggregateType: "approval_case", aggregateId: committed.approvalCaseId, occurredAt: new Date().toISOString(), payload: { entityType: "StrategyStagedChange", entityId: committed.stagedChangeId, approvalCaseId: committed.approvalCaseId } };
    await subscriber.handle(envelope);
    expect(await prisma.strategyNode.count({ where: { planVersionId: planId } })).toBe(beforeNodes + 2);
    expect(await prisma.strategyEdge.count({ where: { planVersionId: planId } })).toBe(beforeEdges + 2);
    expect(await prisma.portfolioHierarchyImport.findUnique({ where: { id: diff.diffId } })).toMatchObject({ status: "APPLIED" });
    await subscriber.handle(envelope);
    expect(await prisma.strategyNode.count({ where: { planVersionId: planId } })).toBe(beforeNodes + 2);
    expect(await prisma.strategyEdge.count({ where: { planVersionId: planId } })).toBe(beforeEdges + 2);
  });

  it("rolls back the whole hierarchy batch when a later edge violates the real graph constraints", async () => {
    const audit = await portfolio.importHierarchyDryRun({ bytes: json([]), format: "json", planVersionId: planId, actorUserId: submitterId });
    const stagedChangeId = randomUUID();
    const approval = await governance.createCase({ entityType: "StrategyStagedChange", entityId: stagedChangeId, submittedBy: submitterId, approvalParticipantId: approverId, proposedChange: { before: null, after: {} } });
    const portfolioNodeId = randomUUID();
    const areaId = randomUUID();
    await strategy.stageHierarchyImport({ stagedChangeId, approvalCaseId: approval.id, planVersionId: planId, diffId: audit.diffId, actorUserId: submitterId, nodes: [{ id: portfolioNodeId, type: "portfolio", nameEn: "Atomic Portfolio", nameAr: "محفظة ذرية" }, { id: areaId, type: "area_of_focus", nameEn: "Atomic Area", nameAr: "مجال ذري" }], edges: [{ id: randomUUID(), fromNodeId: portfolioNodeId, toNodeId: areaId, edgeType: "contains" }, { id: randomUUID(), fromNodeId: portfolioNodeId, toNodeId: exactPlayId, edgeType: "contains" }] });
    await prisma.portfolioHierarchyImport.update({ where: { id: audit.diffId }, data: { stagedChangeId, approvalCaseId: approval.id } });
    const activation = new StrategyActivationService(prisma, eventBus as never);
    await expect(activation.activate(stagedChangeId, approval.id)).rejects.toThrow();
    expect(await prisma.strategyNode.count({ where: { id: { in: [portfolioNodeId, areaId] } } })).toBe(0);
    expect(await prisma.strategyEdge.count({ where: { fromNodeId: portfolioNodeId } })).toBe(0);
    expect(await prisma.stagedChange.findUnique({ where: { id: stagedChangeId } })).toMatchObject({ status: "PENDING" });
    expect(await prisma.portfolioHierarchyImport.findUnique({ where: { id: audit.diffId } })).toMatchObject({ status: "DRY_RUN", appliedAt: null });
  });
});
