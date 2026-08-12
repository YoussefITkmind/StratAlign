import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/database/prisma.service";
import { PortfolioService } from "../../src/modules/portfolio/portfolio.service";
import { RulesService } from "../../src/modules/rules/rules.service";

function applyMigrations(databaseUrl: string): void {
  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve("prisma/build/index.js");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}

describe.sequential("Portfolio module with PostgreSQL Testcontainers", () => {
  let postgres: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let prisma: PrismaService;
  let portfolio: PortfolioService;
  let userId: string;
  let planVersionId: string;
  let portfolioId: string;
  let areaOfFocusId: string;
  let mappedPlayId: string;
  let unmappedPlayId: string;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer("postgres:17-alpine")
      .withDatabase("spm_portfolio_test")
      .withUsername("spm_test")
      .withPassword("spm_test_password")
      .start();
    const databaseUrl = postgres.getConnectionUri();
    applyMigrations(databaseUrl);
    prisma = new PrismaService(databaseUrl);
    await prisma.connect();
    portfolio = new PortfolioService(prisma, new RulesService(prisma));
  }, 180_000);

  afterAll(async () => {
    await prisma?.disconnect();
    await postgres?.stop();
  }, 60_000);

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE
      "execution"."risk_indicators",
      "execution"."financial_attrs",
      "execution"."status_updates",
      "execution"."milestone_flags",
      "execution"."jira_links",
      "execution"."initiatives",
      "strategy"."owner_assignments",
      "strategy"."staged_changes",
      "strategy"."strategy_edges",
      "strategy"."strategy_nodes",
      "strategy"."plan_versions",
      "rules"."rule_definitions",
      "iam"."users"
      RESTART IDENTITY CASCADE`);

    const user = await prisma.user.create({
      data: { email: "portfolio-owner@example.test", displayName: "Portfolio Owner" },
    });
    userId = user.id;

    const plan = await prisma.planVersion.create({ data: { name: "Portfolio Plan", status: "ACTIVE" } });
    planVersionId = plan.id;

    const portfolioNode = await prisma.strategyNode.create({
      data: {
        type: "PORTFOLIO",
        nameEn: "Growth Portfolio",
        nameAr: "محفظة النمو",
        planVersionId,
        state: "ACTIVE",
        createdBy: userId,
      },
    });
    portfolioId = portfolioNode.id;

    const aof = await prisma.strategyNode.create({
      data: {
        type: "AREA_OF_FOCUS",
        nameEn: "Digital Experience",
        nameAr: "التجربة الرقمية",
        planVersionId,
        state: "ACTIVE",
        createdBy: userId,
      },
    });
    areaOfFocusId = aof.id;

    const mapped = await prisma.strategyNode.create({
      data: {
        type: "STRATEGIC_PLAY",
        nameEn: "Customer Platform",
        nameAr: "منصة العملاء",
        planVersionId,
        state: "ACTIVE",
        createdBy: userId,
      },
    });
    mappedPlayId = mapped.id;

    const unmapped = await prisma.strategyNode.create({
      data: {
        type: "STRATEGIC_PLAY",
        nameEn: "Unmapped Play",
        nameAr: "مبادرة غير مصنفة",
        planVersionId,
        state: "ACTIVE",
        createdBy: userId,
      },
    });
    unmappedPlayId = unmapped.id;

    await prisma.strategyEdge.create({
      data: {
        fromNodeId: portfolioId,
        toNodeId: areaOfFocusId,
        edgeType: "CONTAINS",
        planVersionId,
      },
    });
    await prisma.strategyEdge.create({
      data: {
        fromNodeId: mappedPlayId,
        toNodeId: areaOfFocusId,
        edgeType: "BELONGS_TO_PORTFOLIO",
        planVersionId,
      },
    });
  });

  it("finds active strategic plays with no Area of Focus membership", async () => {
    const unmapped = await portfolio.findUnmappedPlays();
    expect(unmapped.map((play) => play.id)).toEqual([unmappedPlayId]);
  });

  it("keeps Area of Focus membership optional but limits a play to one Area of Focus", async () => {
    const secondAof = await prisma.strategyNode.create({
      data: {
        type: "AREA_OF_FOCUS",
        nameEn: "Operations",
        nameAr: "العمليات",
        planVersionId,
        state: "ACTIVE",
        createdBy: userId,
      },
    });

    await expect(prisma.strategyEdge.create({
      data: {
        fromNodeId: mappedPlayId,
        toNodeId: secondAof.id,
        edgeType: "BELONGS_TO_PORTFOLIO",
        planVersionId,
      },
    })).rejects.toThrow();

    const stillUnmapped = await portfolio.findUnmappedPlays();
    expect(stillUnmapped.some((play) => play.id === unmappedPlayId)).toBe(true);
  });

  it("aggregates a realistic initiative RAG mix through the published rag_aggregation rule", async () => {
    const rule = await prisma.ruleDefinition.create({
      data: {
        ruleKey: "portfolio-rag",
        ruleType: "RAG_AGGREGATION",
        name: "Portfolio RAG",
        documentJson: {
          ruleType: "rag_aggregation",
          method: "weighted_count",
          watchThreshold: 0.3,
          offTrackThreshold: 0.7,
        },
        version: 1,
        status: "PUBLISHED",
        isCurrent: true,
        publishedAt: new Date(),
        createdById: userId,
      },
    });

    const statuses = ["ON_TRACK", "AT_RISK", "OFF_TRACK"] as const;
    for (const [index, status] of statuses.entries()) {
      const initiative = await prisma.initiative.create({
        data: {
          nameEn: `Initiative ${index + 1}`,
          nameAr: `مبادرة ${index + 1}`,
          strategicPlayNodeId: mappedPlayId,
          ownerUserId: userId,
          stage: "EXECUTE",
        },
      });
      await prisma.statusUpdate.create({
        data: {
          initiativeId: initiative.id,
          period: "2026-08",
          stage: "EXECUTE",
          status,
          confidence: "HIGH",
          narrativeEn: "Fixture status",
          submittedBy: userId,
        },
      });
    }

    const result = await portfolio.computeRag(areaOfFocusId, "2026-08");
    expect(result).toMatchObject({
      areaOfFocusId,
      period: "2026-08",
      status: "watch",
      score: 0.5,
      initiativeCount: 3,
      ruleId: rule.id,
    });
  });
});
