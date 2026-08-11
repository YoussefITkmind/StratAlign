import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/database/prisma.service";
import { StrategyService } from "../../src/modules/strategy/strategy.service";

const execFileAsync = promisify(execFile);

describe.sequential("Strategy model with real PostgreSQL migrations", () => {
  let postgres: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let prisma: PrismaService;
  let strategy: StrategyService;
  let actorId: string;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer("postgres:17-alpine")
      .withDatabase("spm_strategy_test")
      .withUsername("spm_test")
      .withPassword("spm_test_password")
      .start();

    const environment = {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: postgres.getConnectionUri(),
      SEED_TEST_USER_PASSWORD: "TestcontainersSeedPassword123!",
    };

    await execFileAsync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: process.cwd(), env: environment,
    });
    await execFileAsync("pnpm", ["exec", "prisma", "db", "seed"], {
      cwd: process.cwd(), env: environment,
    });

    prisma = new PrismaService(postgres.getConnectionUri());
    await prisma.connect();
    strategy = new StrategyService(prisma);
    actorId = (await prisma.user.findUniqueOrThrow({ where: { email: "bob@example.test" } })).id;
  }, 120_000);

  afterAll(async () => {
    await prisma?.disconnect();
    await postgres?.stop();
  }, 60_000);

  it("installs the strategy schema, enums, rules and constraints transactionally", async () => {
    const migration = await readFile(
      `${process.cwd()}/prisma/migrations/20260811053000_add_strategy_model/migration.sql`,
      "utf8",
    );
    expect(migration.trim()).toMatch(/^BEGIN;[\s\S]*COMMIT;$/);

    const rules = await prisma.$queryRawUnsafe<Array<{ min_count: number; max_count: number | null }>>(
      `SELECT min_count, max_count FROM strategy.relationship_rules`,
    );
    expect(rules).toHaveLength(6);
    expect(rules.some((value) => value.max_count === 1)).toBe(true);
  });

  it("creates a valid typed hierarchy and activates the plan", async () => {
    const version = await strategy.createPlanVersion({ name: "FY27 Strategy", createdBy: actorId });
    const corporate = await strategy.createNode({
      type: "corporate_strategy", nameEn: "Corporate Strategy", nameAr: "الاستراتيجية المؤسسية",
      planVersionId: version.id, createdBy: actorId,
    });
    const theme = await strategy.createNode({
      type: "theme", nameEn: "Growth", nameAr: "النمو",
      planVersionId: version.id, createdBy: actorId,
    });
    const objective = await strategy.createNode({
      type: "objective", nameEn: "Expand", nameAr: "التوسع",
      planVersionId: version.id, createdBy: actorId,
    });

    await strategy.createEdge({
      fromNodeId: corporate.id, toNodeId: theme.id, edgeType: "contains", planVersionId: version.id,
    });
    await strategy.createEdge({
      fromNodeId: theme.id, toNodeId: objective.id, edgeType: "contains", planVersionId: version.id,
    });
    await strategy.assignOwner({
      nodeId: objective.id, userId: actorId, planVersionId: version.id, createdBy: actorId,
    });

    await expect(strategy.validatePlanVersion(version.id)).resolves.toBeUndefined();
    const active = await strategy.activatePlanVersion(version.id);
    expect(active.state).toBe("active");
    expect((await strategy.getGraph(version.id)).owners).toHaveLength(1);
  });

  it("rejects invalid relationship types even through direct SQL", async () => {
    const version = await strategy.createPlanVersion({ name: "Invalid Link Test", createdBy: actorId });
    const portfolio = await strategy.createNode({
      type: "portfolio", nameEn: "Portfolio", nameAr: "المحفظة",
      planVersionId: version.id, createdBy: actorId,
    });
    const corporate = await strategy.createNode({
      type: "corporate_strategy", nameEn: "Corporate", nameAr: "المؤسسية",
      planVersionId: version.id, createdBy: actorId,
    });

    await expect(prisma.$executeRawUnsafe(
      `INSERT INTO strategy.strategy_edges
       (id, from_node_id, to_node_id, edge_type, plan_version_id)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'contains', $3::uuid)`,
      portfolio.id, corporate.id, version.id,
    )).rejects.toThrow();
  });

  it("enforces max relationship cardinality and carries graph data into a new plan version", async () => {
    const version = await strategy.createPlanVersion({ name: "Carry Forward Source", createdBy: actorId });
    const play = await strategy.createNode({
      type: "strategic_play", nameEn: "Play", nameAr: "المبادرة الاستراتيجية",
      planVersionId: version.id, createdBy: actorId,
    });
    const portfolioA = await strategy.createNode({
      type: "portfolio", nameEn: "Portfolio A", nameAr: "المحفظة أ",
      planVersionId: version.id, createdBy: actorId,
    });
    const portfolioB = await strategy.createNode({
      type: "portfolio", nameEn: "Portfolio B", nameAr: "المحفظة ب",
      planVersionId: version.id, createdBy: actorId,
    });
    await strategy.createEdge({
      fromNodeId: play.id, toNodeId: portfolioA.id,
      edgeType: "belongs_to_portfolio", planVersionId: version.id,
    });
    await expect(strategy.createEdge({
      fromNodeId: play.id, toNodeId: portfolioB.id,
      edgeType: "belongs_to_portfolio", planVersionId: version.id,
    })).rejects.toThrow();

    await strategy.assignOwner({
      nodeId: play.id, userId: actorId, planVersionId: version.id, createdBy: actorId,
    });
    const clone = await strategy.clonePlanVersion(version.id, "Carry Forward Clone", actorId);
    const clonedGraph = await strategy.getGraph(clone.id);
    expect(clone.sourcePlanVersionId).toBe(version.id);
    expect(clonedGraph.nodes).toHaveLength(3);
    expect(clonedGraph.edges).toHaveLength(1);
    expect(clonedGraph.owners).toHaveLength(1);
    expect(clonedGraph.nodes.every((value) => value.state === "draft")).toBe(true);
  });
});
