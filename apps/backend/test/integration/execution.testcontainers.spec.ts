import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/database/prisma.service";
import { ExecutionService } from "../../src/modules/execution/execution.service";

function applyMigrations(databaseUrl: string): void {
  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve("prisma/build/index.js");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}

describe.sequential("Execution module with PostgreSQL Testcontainers", () => {
  let postgres: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let prisma: PrismaService;
  let execution: ExecutionService;
  let ownerId: string;
  let initiativeOwnerId: string;
  let otherUserId: string;
  let planVersionId: string;
  let activePlayId: string;
  let draftPlayId: string;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer("postgres:17-alpine")
      .withDatabase("spm_execution_test")
      .withUsername("spm_test")
      .withPassword("spm_test_password")
      .start();
    const databaseUrl = postgres.getConnectionUri();
    applyMigrations(databaseUrl);
    prisma = new PrismaService(databaseUrl);
    await prisma.connect();
    execution = new ExecutionService(prisma);
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
      "iam"."users"
      RESTART IDENTITY CASCADE`);

    const [owner, initiativeOwner, other] = await Promise.all([
      prisma.user.create({ data: { email: "execution-owner@example.test", displayName: "Play Owner" } }),
      prisma.user.create({ data: { email: "execution-initiative-owner@example.test", displayName: "Initiative Owner" } }),
      prisma.user.create({ data: { email: "execution-other@example.test", displayName: "Other User" } }),
    ]);
    ownerId = owner.id;
    initiativeOwnerId = initiativeOwner.id;
    otherUserId = other.id;

    const plan = await prisma.planVersion.create({ data: { name: "Execution Plan", status: "ACTIVE" } });
    planVersionId = plan.id;

    const active = await prisma.strategyNode.create({
      data: {
        type: "STRATEGIC_PLAY",
        nameEn: "Digital Growth",
        nameAr: "النمو الرقمي",
        planVersionId,
        state: "ACTIVE",
        createdBy: ownerId,
      },
    });
    activePlayId = active.id;

    const draft = await prisma.strategyNode.create({
      data: {
        type: "STRATEGIC_PLAY",
        nameEn: "Draft Play",
        nameAr: "مبادرة مسودة",
        planVersionId,
        state: "DRAFT",
        createdBy: ownerId,
      },
    });
    draftPlayId = draft.id;

    await prisma.ownerAssignment.create({
      data: { nodeId: activePlayId, ownerUserId: ownerId, assignedBy: ownerId },
    });
  });

  async function registerActiveInitiative() {
    return execution.registerInitiative({
      nameEn: "Customer Platform",
      nameAr: "منصة العملاء",
      strategicPlayNodeId: activePlayId,
      ownerUserId: initiativeOwnerId,
      stage: "execute",
      actorUserId: ownerId,
      actorIsSeoAdministrator: false,
    });
  }

  it("registers only against a real active strategic_play owned by the caller", async () => {
    const created = await registerActiveInitiative();
    expect(created.strategicPlayNodeId).toBe(activePlayId);

    await expect(execution.registerInitiative({
      nameEn: "Invalid",
      nameAr: "غير صالح",
      strategicPlayNodeId: "00000000-0000-4000-8000-000000000001",
      ownerUserId: ownerId,
      stage: "design",
      actorUserId: ownerId,
      actorIsSeoAdministrator: false,
    })).rejects.toMatchObject({ code: "EXECUTION_INVALID_PLAY" });

    await expect(execution.registerInitiative({
      nameEn: "Draft-linked",
      nameAr: "مرتبطة بمسودة",
      strategicPlayNodeId: draftPlayId,
      ownerUserId: ownerId,
      stage: "design",
      actorUserId: ownerId,
      actorIsSeoAdministrator: false,
    })).rejects.toMatchObject({ code: "EXECUTION_INVALID_PLAY" });

    await expect(execution.registerInitiative({
      nameEn: "Wrong owner",
      nameAr: "مالك غير صحيح",
      strategicPlayNodeId: activePlayId,
      ownerUserId: otherUserId,
      stage: "pilot",
      actorUserId: otherUserId,
      actorIsSeoAdministrator: false,
    })).rejects.toMatchObject({ code: "EXECUTION_PLAY_OWNERSHIP_REQUIRED" });
  });

  it("rejects manual FinancialAttr and RiskIndicator writes after feed-bound values are locked", async () => {
    const initiative = await registerActiveInitiative();

    await execution.setFinancialAttr({
      initiativeId: initiative.id,
      budgetAmount: 1_000_000,
      spendAmount: 400_000,
      currency: "SAR",
      source: "erp",
      locked: true,
    });
    await expect(execution.setFinancialAttr({
      initiativeId: initiative.id,
      budgetAmount: 1_100_000,
      spendAmount: 450_000,
      currency: "SAR",
      source: "manual",
      locked: false,
    })).rejects.toMatchObject({ code: "EXECUTION_FEED_LOCKED" });

    await execution.setRiskIndicator({
      initiativeId: initiative.id,
      level: "high",
      source: "jira",
      locked: true,
    });
    await expect(execution.setRiskIndicator({
      initiativeId: initiative.id,
      level: "low",
      source: "manual",
      locked: false,
    })).rejects.toMatchObject({ code: "EXECUTION_FEED_LOCKED" });
  });

  it("keeps monthly status history append-only and orders it by period", async () => {
    const initiative = await registerActiveInitiative();

    const june = await execution.updateStatus({
      initiativeId: initiative.id,
      period: "2026-06",
      stage: "pilot",
      status: "at_risk",
      confidence: "medium",
      narrativeEn: "Pilot dependency risk",
      actorUserId: initiativeOwnerId,
      actorIsSeoAdministrator: false,
    });
    await execution.updateStatus({
      initiativeId: initiative.id,
      period: "2026-08",
      stage: "execute",
      status: "on_track",
      confidence: "high",
      narrativeEn: "Execution recovered",
      actorUserId: initiativeOwnerId,
      actorIsSeoAdministrator: false,
    });
    await execution.updateStatus({
      initiativeId: initiative.id,
      period: "2026-07",
      stage: "execute",
      status: "off_track",
      confidence: "high",
      narrativeEn: "Supplier delay",
      actorUserId: initiativeOwnerId,
      actorIsSeoAdministrator: false,
    });

    const history = await execution.statusHistory(initiative.id);
    expect(history.map((entry) => entry.period)).toEqual(["2026-08", "2026-07", "2026-06"]);

    await expect(prisma.$executeRawUnsafe(
      `UPDATE "execution"."status_updates" SET "period" = '2025-01' WHERE "id" = '${june.id}'`,
    )).rejects.toThrow(/append-only/);
  });

  it("authorizes initiative writes for the initiative owner, play owner, or SEO administrator", async () => {
    const initiative = await registerActiveInitiative();

    await expect(execution.updateStatus({
      initiativeId: initiative.id,
      period: "2026-05",
      stage: "execute",
      status: "on_track",
      confidence: "high",
      actorUserId: initiativeOwnerId,
      actorIsSeoAdministrator: false,
    })).resolves.toMatchObject({ submittedBy: initiativeOwnerId });

    await expect(execution.updateStatus({
      initiativeId: initiative.id,
      period: "2026-06",
      stage: "execute",
      status: "at_risk",
      confidence: "medium",
      actorUserId: ownerId,
      actorIsSeoAdministrator: false,
    })).resolves.toMatchObject({ submittedBy: ownerId });

    await expect(execution.updateStatus({
      initiativeId: initiative.id,
      period: "2026-07",
      stage: "execute",
      status: "off_track",
      confidence: "low",
      actorUserId: otherUserId,
      actorIsSeoAdministrator: false,
    })).rejects.toMatchObject({ code: "EXECUTION_INITIATIVE_OWNERSHIP_REQUIRED" });

    await expect(execution.updateStatus({
      initiativeId: initiative.id,
      period: "2026-08",
      stage: "execute",
      status: "on_track",
      confidence: "high",
      actorUserId: otherUserId,
      actorIsSeoAdministrator: true,
    })).resolves.toMatchObject({ submittedBy: otherUserId });
  });

  it("rejects Jira and milestone writes by an unrelated actor", async () => {
    const initiative = await registerActiveInitiative();
    const jiraInput = {
      initiativeId: initiative.id,
      jiraProjectKey: "EXEC",
      jiraProjectUrl: "https://jira.example.test/projects/EXEC",
    };

    await expect(execution.linkJira({
      ...jiraInput,
      actorUserId: otherUserId,
      actorIsSeoAdministrator: false,
    })).rejects.toMatchObject({ code: "EXECUTION_INITIATIVE_OWNERSHIP_REQUIRED" });

    const jiraLink = await execution.linkJira({
      ...jiraInput,
      actorUserId: initiativeOwnerId,
      actorIsSeoAdministrator: false,
    });

    await expect(execution.flagMilestone({
      jiraLinkId: jiraLink.id,
      nameEn: "Pilot complete",
      nameAr: "Pilot complete",
      dueDate: new Date("2026-09-01T00:00:00Z"),
      health: "on_time",
      source: "manual",
      actorUserId: otherUserId,
      actorIsSeoAdministrator: false,
    })).rejects.toMatchObject({ code: "EXECUTION_INITIATIVE_OWNERSHIP_REQUIRED" });
  });
});
