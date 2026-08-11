import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { performance } from "node:perf_hooks";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../../src/database/prisma.service";
import { StrategyActivationService } from "../../src/modules/strategy/strategy-activation.service";
import { StrategyApprovalSubscriber } from "../../src/modules/strategy/strategy-approval.subscriber";
import { StrategyService } from "../../src/modules/strategy/strategy.service";
import { MAX_STRATEGY_TRAVERSAL_DEPTH, StrategyTraversalService } from "../../src/modules/strategy/strategy-traversal.service";

const execFileAsync = promisify(execFile);

describe.sequential("Prompt 2.2 traversal and activation with PostgreSQL Testcontainers", () => {
  let postgres: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let prisma: PrismaService;
  let strategy: StrategyService;
  let traversal: StrategyTraversalService;
  let actorId: string;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer("postgres:17-alpine")
      .withDatabase("spm_strategy_traversal_test")
      .withUsername("spm_test")
      .withPassword("spm_test_password")
      .start();
    await execFileAsync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "test", DATABASE_URL: postgres.getConnectionUri() },
    });
    prisma = new PrismaService(postgres.getConnectionUri());
    await prisma.connect();
    const actor = await prisma.user.create({
      data: { email: `strategy-traversal-${randomUUID()}@example.test`, displayName: "Traversal Admin" },
    });
    actorId = actor.id;
    strategy = new StrategyService(prisma);
    traversal = new StrategyTraversalService(prisma);
    await prisma.$executeRawUnsafe(`
      INSERT INTO strategy.relationship_rules (from_type,to_type,edge_type,min_count,max_count)
      VALUES ('objective','objective','aligns_to',0,NULL)
      ON CONFLICT DO NOTHING
    `);
  }, 120_000);

  afterAll(async () => {
    await prisma?.disconnect();
    await postgres?.stop();
  }, 60_000);

  async function objective(planVersionId: string, name: string): Promise<string> {
    const node = await strategy.createNode({
      type: "objective", nameEn: name, nameAr: `AR ${name}`, planVersionId, actorUserId: actorId,
    }) as { id: string };
    return node.id;
  }

  it("returns a correct depth-5+ cascade and ancestry path", async () => {
    const plan = await strategy.createPlanVersion("Traversal fixture");
    const ids: string[] = [];
    for (let i = 0; i < 7; i += 1) ids.push(await objective(plan.id, `N${i}`));
    for (let i = 0; i < ids.length - 1; i += 1) {
      await strategy.linkEdge({
        fromNodeId: ids[i]!, toNodeId: ids[i + 1]!, edgeType: "aligns_to",
        planVersionId: plan.id, actorUserId: actorId,
      });
    }

    const cascade = await traversal.getCascade(ids[0]!, 6);
    expect(cascade.map((n) => n.depth)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(cascade.map((n) => n.id)).toEqual(ids.slice(1));

    const ancestry = await traversal.getAncestry(ids[6]!);
    expect(ancestry).toHaveLength(6);
    expect(ancestry[0]?.id).toBe(ids[0]);
    expect(ancestry.at(-1)?.id).toBe(ids[5]);

    const trace = await traversal.getFullTrace(ids[3]!);
    expect(trace.ancestry).toHaveLength(3);
    expect(trace.cascade).toHaveLength(3);
  });

  it("enforces the ADR-03 depth boundary", async () => {
    const plan = await strategy.createPlanVersion("Depth boundary");
    const root = await objective(plan.id, "Depth root");
    await expect(traversal.getCascade(root, MAX_STRATEGY_TRAVERSAL_DEPTH)).resolves.toEqual([]);
    await expect(traversal.getCascade(root, MAX_STRATEGY_TRAVERSAL_DEPTH + 1)).rejects.toThrow(/between 1 and 8/i);
    await expect(traversal.getCascade(root, 0)).rejects.toThrow(/between 1 and 8/i);
  });

  it("activates exactly the staged change referenced by approval", async () => {
    const plan = await strategy.createPlanVersion("Selective approval");
    const corporate = await strategy.createNode({ type: "corporate_strategy", nameEn: "Corporate", nameAr: "AR Corporate", planVersionId: plan.id, actorUserId: actorId }) as { id: string };
    const theme = await strategy.createNode({ type: "theme", nameEn: "Theme", nameAr: "AR Theme", planVersionId: plan.id, actorUserId: actorId }) as { id: string };
    const objectiveNode = await strategy.createNode({ type: "objective", nameEn: "Objective", nameAr: "AR Objective", planVersionId: plan.id, actorUserId: actorId }) as { id: string };
    const play = await strategy.createNode({ type: "strategic_play", nameEn: "Play", nameAr: "AR Play", planVersionId: plan.id, actorUserId: actorId }) as { id: string };
    await strategy.linkEdge({ fromNodeId: corporate.id, toNodeId: theme.id, edgeType: "contains", planVersionId: plan.id, actorUserId: actorId });
    await strategy.linkEdge({ fromNodeId: theme.id, toNodeId: objectiveNode.id, edgeType: "contains", planVersionId: plan.id, actorUserId: actorId });
    await strategy.linkEdge({ fromNodeId: objectiveNode.id, toNodeId: play.id, edgeType: "executed_by", planVersionId: plan.id, actorUserId: actorId });
    await strategy.openPlanVersion(plan.id);

    const approvalCaseId = randomUUID();
    const selected = await strategy.updateNode({
      nodeId: objectiveNode.id, nameEn: "Selected update", actorUserId: actorId, approvalCaseId,
    }) as { id: string };
    const unrelated = await strategy.updateNode({
      nodeId: theme.id, nameEn: "Unrelated update", actorUserId: actorId, approvalCaseId,
    }) as { id: string };

    const publishWithin = vi.fn().mockResolvedValue(1);
    const activation = new StrategyActivationService(prisma, {
      publishWithin,
      nudgeRelay: vi.fn().mockResolvedValue(undefined),
    } as never);
    const subscriber = new StrategyApprovalSubscriber(activation);
    await subscriber.handle({
      eventId: randomUUID(), eventType: "governance.approval.granted", eventVersion: 1,
      aggregateType: "approval_case", aggregateId: approvalCaseId, occurredAt: new Date().toISOString(),
      payload: { domain: "strategy", approvalCaseId, stagedChangeId: selected.id },
    });

    const statuses = await prisma.$queryRawUnsafe<Array<{ id: string; status: string }>>(`
      SELECT id, status::text AS status FROM strategy.staged_changes
      WHERE id = ANY($1::uuid[]) ORDER BY id
    `, [selected.id, unrelated.id]);
    expect(statuses.find((row) => row.id === selected.id)?.status).toBe("applied");
    expect(statuses.find((row) => row.id === unrelated.id)?.status).toBe("pending");

    const nodes = await strategy.listActiveNodes(plan.id);
    expect(nodes.find((n) => n.id === objectiveNode.id)?.nameEn).toBe("Selected update");
    expect(nodes.find((n) => n.id === theme.id)?.nameEn).toBe("Theme");
    expect(publishWithin).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({
      eventType: "strategy.node.activated",
      aggregateId: objectiveNode.id,
      payload: expect.objectContaining({ stagedChangeId: selected.id }),
    })]);
  });

  it("keeps a ~500-node cascade query comfortably small for the current phase", async () => {
    const plan = await strategy.createPlanVersion("Performance fixture");
    const root = await objective(plan.id, "Perf root");
    const children: string[] = [];
    for (let i = 0; i < 499; i += 1) children.push(randomUUID());

    await prisma.$executeRawUnsafe(`
      INSERT INTO strategy.strategy_nodes (id,type,name_en,name_ar,plan_version_id,state,created_by)
      SELECT x.id::uuid, 'objective'::strategy."StrategyNodeType", 'Perf child', 'AR Perf child', $1::uuid, 'draft', $2
      FROM unnest($3::text[]) AS x(id)
    `, plan.id, actorId, children);
    await prisma.$executeRawUnsafe(`
      INSERT INTO strategy.strategy_edges (id,from_node_id,to_node_id,edge_type,plan_version_id)
      SELECT gen_random_uuid(), $1::uuid, x.id::uuid, 'aligns_to'::strategy."StrategyEdgeType", $2::uuid
      FROM unnest($3::text[]) AS x(id)
    `, root, plan.id, children);

    const started = performance.now();
    const result = await traversal.getCascade(root, 8);
    const elapsedMs = performance.now() - started;
    expect(result).toHaveLength(499);
    // Phase 2.2 is a sanity measurement, not a hard performance gate.
    console.info(`[strategy traversal] 500-node cascade: ${elapsedMs.toFixed(2)}ms`);
  });
});
