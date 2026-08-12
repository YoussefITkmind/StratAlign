import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const PLAN_ID = "82000000-0000-4000-8000-000000000001";

async function bootstrap() {
  const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@example.test" } });
  const bob = await prisma.user.findUniqueOrThrow({ where: { email: "bob@example.test" } });
  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { name: "kpi_owner" } });
  const strategyAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: "seo_administrator" } });

  for (const grant of [
    { userId: alice.id, roleId: ownerRole.id },
    { userId: bob.id, roleId: strategyAdminRole.id },
  ]) {
    await prisma.scopeGrant.upsert({
      where: {
        userId_roleId_orgScopeType_orgScopeId: {
          ...grant,
          orgScopeType: "FUNCTION",
          orgScopeId: "platform",
        },
      },
      update: {},
      create: {
        ...grant,
        orgScopeType: "FUNCTION",
        orgScopeId: "platform",
        grantedById: bob.id,
      },
    });
  }

  await prisma.planVersion.upsert({
    where: { id: PLAN_ID },
    update: { name: "Phase 2 Vertical E2E Strategy", status: "DRAFT" },
    create: { id: PLAN_ID, name: "Phase 2 Vertical E2E Strategy", status: "DRAFT" },
  });

  console.log(JSON.stringify({ aliceId: alice.id, bobId: bob.id, planId: PLAN_ID }));
}

async function prepareCapture(kpiName: string, strategyName: string) {
  const version = await prisma.kpiVersion.findFirstOrThrow({
    where: { nameEn: kpiName },
    orderBy: { createdAt: "desc" },
  });
  const node = await prisma.strategyNode.findFirstOrThrow({
    where: { nameEn: strategyName, planVersionId: PLAN_ID },
    orderBy: { createdAt: "desc" },
  });
  const period = "2026-08";
  const priorPeriod = "2026-07";
  const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@example.test" } });
  const now = new Date();
  const due = new Date(now.getTime() + 60 * 60 * 1000);

  await prisma.targetSeries.upsert({
    where: {
      kpiVersionId_scopeNodeId_period_planVersionId: {
        kpiVersionId: version.id,
        scopeNodeId: node.id,
        period,
        planVersionId: PLAN_ID,
      },
    },
    update: { targetValue: 100 },
    create: {
      kpiVersionId: version.id,
      scopeNodeId: node.id,
      period,
      targetValue: 100,
      planVersionId: PLAN_ID,
    },
  });

  await prisma.measurement.create({
    data: {
      kpiVersionId: version.id,
      scopeNodeId: node.id,
      period: priorPeriod,
      value: 92,
      source: "MANUAL",
      submittedById: alice.id,
    },
  });

  const definition = await prisma.cadenceDefinition.create({
    data: {
      key: `phase2-vertical-${version.id}`,
      name: `Capture ${kpiName}`,
      subjectType: "performance_kpi",
      subjectId: version.id,
      payload: { scopeNodeId: node.id, period },
      cadenceType: "ADHOC",
      cadenceConfig: { type: "ADHOC", runAt: now.toISOString() },
      anchorAt: now,
      startsAt: now,
      endsAt: due,
      status: "PAUSED",
      nextOccurrenceAt: null,
    },
  });
  await prisma.cadenceInstance.create({
    data: {
      cadenceDefinitionId: definition.id,
      sequence: 1,
      occurrenceAt: now,
      periodKey: period,
      windowOpensAt: now,
      windowClosingAt: due,
      windowClosesAt: due,
      reviewDueAt: due,
      status: "OPEN",
      payloadSnapshot: { scopeNodeId: node.id, period },
    },
  });

  console.log(JSON.stringify({ kpiDefinitionId: version.kpiDefinitionId, kpiVersionId: version.id, strategyNodeId: node.id, period }));
}

async function main() {
  const [mode, kpiName, strategyName] = process.argv.slice(2);
  if (mode === "bootstrap") return bootstrap();
  if (mode === "prepare-capture" && kpiName && strategyName) return prepareCapture(kpiName, strategyName);
  throw new Error("Usage: bootstrap | prepare-capture <kpi-name> <strategy-name>");
}

main()
  .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
