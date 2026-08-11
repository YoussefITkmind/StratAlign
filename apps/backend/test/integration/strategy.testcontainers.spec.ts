import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../../src/database/prisma.service";
import { StrategyActivationService } from "../../src/modules/strategy/strategy-activation.service";
import { StrategyApprovalSubscriber } from "../../src/modules/strategy/strategy-approval.subscriber";
import { StrategyService } from "../../src/modules/strategy/strategy.service";

const execFileAsync = promisify(execFile);

describe.sequential("Prompt 2.1 strategy model with PostgreSQL Testcontainers", () => {
  let postgres: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let prisma: PrismaService;
  let strategy: StrategyService;
  let actorId: string;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer("postgres:17-alpine")
      .withDatabase("spm_strategy_test").withUsername("spm_test").withPassword("spm_test_password").start();
    await execFileAsync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: process.cwd(), env: { ...process.env, NODE_ENV: "test", DATABASE_URL: postgres.getConnectionUri() },
    });
    prisma = new PrismaService(postgres.getConnectionUri());
    await prisma.connect();
    const actor = await prisma.user.create({ data: { email: `strategy-${randomUUID()}@example.test`, displayName: "Strategy Admin" } });
    actorId = actor.id;
    strategy = new StrategyService(prisma);
  }, 120_000);

  afterAll(async () => { await prisma?.disconnect(); await postgres?.stop(); }, 60_000);

  async function addNode(planVersionId: string, type: Parameters<StrategyService["createNode"]>[0]["type"], label: string) {
    return strategy.createNode({ type, nameEn: label, nameAr: `AR ${label}`, planVersionId, actorUserId: actorId });
  }

  it("accepts valid edges and rejects invalid type, cardinality, and cycles", async () => {
    const plan = await strategy.createPlanVersion("Graph validation");
    const corporate = await addNode(plan.id, "corporate_strategy", "Corporate") as { id: string };
    const theme = await addNode(plan.id, "theme", "Theme") as { id: string };
    await expect(strategy.linkEdge({ fromNodeId: corporate.id, toNodeId: theme.id, edgeType: "contains", planVersionId: plan.id, actorUserId: actorId })).resolves.toMatchObject({ edgeType: "contains" });

    const portfolio1 = await addNode(plan.id, "portfolio", "P1") as { id: string };
    await expect(strategy.linkEdge({ fromNodeId: corporate.id, toNodeId: portfolio1.id, edgeType: "contains", planVersionId: plan.id, actorUserId: actorId })).rejects.toThrow(/invalid strategy relationship/i);

    const play = await addNode(plan.id, "strategic_play", "Play") as { id: string };
    const portfolio2 = await addNode(plan.id, "portfolio", "P2") as { id: string };
    await strategy.linkEdge({ fromNodeId: play.id, toNodeId: portfolio1.id, edgeType: "belongs_to_portfolio", planVersionId: plan.id, actorUserId: actorId });
    await expect(strategy.linkEdge({ fromNodeId: play.id, toNodeId: portfolio2.id, edgeType: "belongs_to_portfolio", planVersionId: plan.id, actorUserId: actorId })).rejects.toThrow(/max_count/i);

    await prisma.$executeRawUnsafe(`INSERT INTO strategy.relationship_rules (from_type,to_type,edge_type,min_count,max_count) VALUES ('objective','objective','aligns_to',0,NULL) ON CONFLICT DO NOTHING`);
    const a = await addNode(plan.id, "objective", "A") as { id: string };
    const b = await addNode(plan.id, "objective", "B") as { id: string };
    await strategy.linkEdge({ fromNodeId: a.id, toNodeId: b.id, edgeType: "aligns_to", planVersionId: plan.id, actorUserId: actorId });
    await expect(strategy.linkEdge({ fromNodeId: b.id, toNodeId: a.id, edgeType: "aligns_to", planVersionId: plan.id, actorUserId: actorId })).rejects.toThrow(/cycle/i);
  });

  it("allows incomplete drafts but enforces minimum cardinality before activation", async () => {
    const plan = await strategy.createPlanVersion("Minimum cardinality");

    const corporate = await addNode(plan.id, "corporate_strategy", "Corporate") as { id: string };
    const theme = await addNode(plan.id, "theme", "Theme") as { id: string };

    await strategy.linkEdge({
      fromNodeId: corporate.id,
      toNodeId: theme.id,
      edgeType: "contains",
      planVersionId: plan.id,
      actorUserId: actorId,
    });

    await expect(strategy.openPlanVersion(plan.id))
      .rejects.toThrow(/minimum relationship cardinality/i);

    const objective = await addNode(plan.id, "objective", "Objective") as { id: string };
    const play = await addNode(plan.id, "strategic_play", "Play") as { id: string };

    await strategy.linkEdge({
      fromNodeId: theme.id,
      toNodeId: objective.id,
      edgeType: "contains",
      planVersionId: plan.id,
      actorUserId: actorId,
    });

    await strategy.linkEdge({
      fromNodeId: objective.id,
      toNodeId: play.id,
      edgeType: "executed_by",
      planVersionId: plan.id,
      actorUserId: actorId,
    });

    await expect(strategy.openPlanVersion(plan.id))
      .resolves.toMatchObject({ status: "active" });
  });

  it("keeps staged active changes invisible until approval then applies the referenced change", async () => {
    const plan = await strategy.createPlanVersion("Approval test");
    const corporate = await addNode(plan.id, "corporate_strategy", "Corporate") as { id: string };
    const theme = await addNode(plan.id, "theme", "Theme") as { id: string };
    const objective = await addNode(plan.id, "objective", "Objective") as { id: string };
    const play = await addNode(plan.id, "strategic_play", "Play") as { id: string };
    await strategy.linkEdge({ fromNodeId: corporate.id, toNodeId: theme.id, edgeType: "contains", planVersionId: plan.id, actorUserId: actorId });
    await strategy.linkEdge({ fromNodeId: theme.id, toNodeId: objective.id, edgeType: "contains", planVersionId: plan.id, actorUserId: actorId });
    await strategy.linkEdge({ fromNodeId: objective.id, toNodeId: play.id, edgeType: "executed_by", planVersionId: plan.id, actorUserId: actorId });
    await strategy.openPlanVersion(plan.id);

    const approvalCaseId = randomUUID();
    const staged = await strategy.updateNode({ nodeId: objective.id, nameEn: "Approved objective", actorUserId: actorId, approvalCaseId }) as { id: string };
    expect((await strategy.listActiveNodes(plan.id)).find((n) => n.id === objective.id)?.nameEn).toBe("Objective");

    const eventBus = {
      publishWithin: vi.fn().mockResolvedValue(1),
      nudgeRelay: vi.fn().mockResolvedValue(undefined),
    };
    const subscriber = new StrategyApprovalSubscriber(new StrategyActivationService(prisma, eventBus as never));
    const envelope = {
      eventId: randomUUID(), eventType: "governance.approval.granted", eventVersion: 1,
      aggregateType: "approval_case", aggregateId: approvalCaseId, occurredAt: new Date().toISOString(),
      payload: {
        entityType: "StrategyStagedChange",
        entityId: staged.id,
        approvalCaseId,
      },
    };
    await expect(subscriber.handle(envelope)).resolves.toBeUndefined();
    expect((await strategy.listActiveNodes(plan.id)).find((n) => n.id === objective.id)?.nameEn).toBe("Approved objective");
  });

  it("carry-forward produces a draft copy without mutating the source", async () => {
    const source = await strategy.createPlanVersion("FY26");
    const corporate = await addNode(source.id, "corporate_strategy", "Corporate") as { id: string };
    const theme = await addNode(source.id, "theme", "Theme") as { id: string };
    const objective = await addNode(source.id, "objective", "Objective") as { id: string };
    const play = await addNode(source.id, "strategic_play", "Play") as { id: string };
    await strategy.linkEdge({ fromNodeId: corporate.id, toNodeId: theme.id, edgeType: "contains", planVersionId: source.id, actorUserId: actorId });
    await strategy.linkEdge({ fromNodeId: theme.id, toNodeId: objective.id, edgeType: "contains", planVersionId: source.id, actorUserId: actorId });
    await strategy.linkEdge({ fromNodeId: objective.id, toNodeId: play.id, edgeType: "executed_by", planVersionId: source.id, actorUserId: actorId });
    await strategy.openPlanVersion(source.id);
    const sourceBefore = await strategy.listActiveNodes(source.id);

    const carried = await strategy.carryForward(source.id, "FY27", actorId);
    expect(carried).toMatchObject({ status: "draft", sourcePlanVersionId: source.id });
    expect(await strategy.listActiveNodes(carried.id)).toHaveLength(0);
    const drafts = await prisma.$queryRawUnsafe<Array<{ count: number }>>(`SELECT COUNT(*)::int AS count FROM strategy.strategy_nodes WHERE plan_version_id=$1::uuid AND state='draft'`, carried.id);
    expect(drafts[0]?.count).toBe(sourceBefore.length);
    expect(await strategy.listActiveNodes(source.id)).toEqual(sourceBefore);
    expect((await strategy.getEdges(carried.id)).length).toBe(3);
  });
});
