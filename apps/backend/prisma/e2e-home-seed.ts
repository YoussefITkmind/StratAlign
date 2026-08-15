import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const KPI_NAME = "E2E Customer Satisfaction";
const CADENCE_KEY = "e2e-home-csat-capture";

async function main() {
  const erin = await prisma.user.findUniqueOrThrow({ where: { email: "erin@example.test" } });
  const version = await prisma.kpiVersion.findFirstOrThrow({
    where: { nameEn: KPI_NAME },
    orderBy: { createdAt: "desc" },
  });

  await prisma.kpiVersion.update({
    where: { id: version.id },
    data: { ownerUserId: erin.id },
  });

  const target = await prisma.targetSeries.findFirstOrThrow({
    where: { kpiVersionId: version.id, period: "2026-08" },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  const dueAt = new Date(now.getTime() + 60 * 60 * 1000);
  const definition = await prisma.cadenceDefinition.upsert({
    where: { key: CADENCE_KEY },
    update: {
      subjectId: version.id,
      payload: { scopeNodeId: target.scopeNodeId, period: target.period },
      anchorAt: now,
      startsAt: now,
      endsAt: dueAt,
      status: "PAUSED",
      nextOccurrenceAt: null,
    },
    create: {
      key: CADENCE_KEY,
      name: "Home checkpoint CSAT capture",
      subjectType: "performance_kpi",
      subjectId: version.id,
      payload: { scopeNodeId: target.scopeNodeId, period: target.period },
      cadenceType: "ADHOC",
      cadenceConfig: { type: "ADHOC", runAt: now.toISOString() },
      anchorAt: now,
      startsAt: now,
      endsAt: dueAt,
      status: "PAUSED",
      nextOccurrenceAt: null,
    },
  });

  await prisma.cadenceInstance.upsert({
    where: {
      cadenceDefinitionId_sequence: {
        cadenceDefinitionId: definition.id,
        sequence: 1,
      },
    },
    update: {
      occurrenceAt: now,
      periodKey: target.period,
      windowOpensAt: now,
      windowClosingAt: dueAt,
      windowClosesAt: dueAt,
      reviewDueAt: dueAt,
      status: "OPEN",
      payloadSnapshot: { scopeNodeId: target.scopeNodeId, period: target.period },
    },
    create: {
      cadenceDefinitionId: definition.id,
      sequence: 1,
      occurrenceAt: now,
      periodKey: target.period,
      windowOpensAt: now,
      windowClosingAt: dueAt,
      windowClosesAt: dueAt,
      reviewDueAt: dueAt,
      status: "OPEN",
      payloadSnapshot: { scopeNodeId: target.scopeNodeId, period: target.period },
    },
  });

  console.log(JSON.stringify({
    erinId: erin.id,
    kpiDefinitionId: version.kpiDefinitionId,
    kpiVersionId: version.id,
    kpiName: version.nameEn,
    cadenceDefinitionId: definition.id,
  }));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
