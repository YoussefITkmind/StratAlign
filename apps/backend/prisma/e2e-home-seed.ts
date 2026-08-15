import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const KPI_NAME = "E2E Home Owner KPI";
const KPI_DEFINITION_ID = "85000000-0000-4000-8000-000000000001";
const KPI_VERSION_ID = "85000000-0000-4000-8000-000000000002";
const PRIOR_MEASUREMENT_ID = "85000000-0000-4000-8000-000000000003";
const CURRENT_MEASUREMENT_ID = "85000000-0000-4000-8000-000000000004";
const TARGET_ID = "85000000-0000-4000-8000-000000000005";
const STATUS_ID = "85000000-0000-4000-8000-000000000006";
const CADENCE_INSTANCE_ID = "85000000-0000-4000-8000-000000000007";
const CADENCE_KEY = "e2e-home-owner-kpi-capture";
const CURRENT_PERIOD = "2026-08";
const PRIOR_PERIOD = "2026-07";

async function main() {
  const erin = await prisma.user.findUniqueOrThrow({ where: { email: "erin@example.test" } });
  const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@example.test" } });

  const referenceTarget = await prisma.targetSeries.findFirstOrThrow({
    where: { period: CURRENT_PERIOD, kpiVersion: { nameEn: "E2E Customer Satisfaction" } },
    orderBy: { createdAt: "desc" },
  });
  const referenceStatus = await prisma.statusResult.findFirstOrThrow({
    where: { period: CURRENT_PERIOD, kpiVersion: { nameEn: "E2E Customer Satisfaction" } },
    orderBy: { computedAt: "desc" },
  });

  await prisma.kpiDefinition.upsert({
    where: { id: KPI_DEFINITION_ID },
    update: { status: "ACTIVE" },
    create: { id: KPI_DEFINITION_ID, status: "ACTIVE" },
  });

  await prisma.kpiVersion.upsert({
    where: { id: KPI_VERSION_ID },
    update: {},
    create: {
      id: KPI_VERSION_ID,
      kpiDefinitionId: KPI_DEFINITION_ID,
      version: 1,
      nameEn: KPI_NAME,
      nameAr: "مؤشر مالك الصفحة الرئيسية (اختبار)",
      unit: "%",
      polarity: "HIGHER_IS_BETTER",
      frequency: "MONTHLY",
      dataSourceType: "MANUAL",
      ownerUserId: erin.id,
      activeFrom: new Date("2026-07-01T00:00:00Z"),
      publishedAt: new Date("2026-07-01T00:00:00Z"),
    },
  });

  await prisma.kpiDefinition.update({
    where: { id: KPI_DEFINITION_ID },
    data: { activeVersionId: KPI_VERSION_ID, status: "ACTIVE" },
  });

  await prisma.targetSeries.upsert({
    where: { id: TARGET_ID },
    update: {},
    create: {
      id: TARGET_ID,
      kpiVersionId: KPI_VERSION_ID,
      scopeNodeId: referenceTarget.scopeNodeId,
      period: CURRENT_PERIOD,
      targetValue: 95,
      planVersionId: referenceTarget.planVersionId,
    },
  });

  await prisma.measurement.upsert({
    where: { id: PRIOR_MEASUREMENT_ID },
    update: {},
    create: {
      id: PRIOR_MEASUREMENT_ID,
      kpiVersionId: KPI_VERSION_ID,
      scopeNodeId: referenceTarget.scopeNodeId,
      period: PRIOR_PERIOD,
      value: 88,
      source: "MANUAL",
      submittedById: alice.id,
    },
  });
  await prisma.measurement.upsert({
    where: { id: CURRENT_MEASUREMENT_ID },
    update: {},
    create: {
      id: CURRENT_MEASUREMENT_ID,
      kpiVersionId: KPI_VERSION_ID,
      scopeNodeId: referenceTarget.scopeNodeId,
      period: CURRENT_PERIOD,
      value: 96,
      source: "MANUAL",
      submittedById: alice.id,
    },
  });

  await prisma.statusResult.upsert({
    where: { id: STATUS_ID },
    update: { status: "On Track" },
    create: {
      id: STATUS_ID,
      kpiVersionId: KPI_VERSION_ID,
      scopeNodeId: referenceTarget.scopeNodeId,
      period: CURRENT_PERIOD,
      status: "On Track",
      ruleVersionUsed: referenceStatus.ruleVersionUsed,
      dedupeKey: `e2e-home-status-${KPI_VERSION_ID}-${CURRENT_PERIOD}`,
    },
  });

  const now = new Date();
  const dueAt = new Date(now.getTime() + 60 * 60 * 1000);
  const definition = await prisma.cadenceDefinition.upsert({
    where: {
      subjectType_subjectId_key: {
        subjectType: "performance_kpi",
        subjectId: KPI_VERSION_ID,
        key: CADENCE_KEY,
      },
    },
    update: {
      name: "Home checkpoint owner KPI capture",
      payload: { scopeNodeId: referenceTarget.scopeNodeId, period: CURRENT_PERIOD },
      anchorAt: now,
      startsAt: now,
      endsAt: dueAt,
      status: "PAUSED",
      nextOccurrenceAt: null,
    },
    create: {
      key: CADENCE_KEY,
      name: "Home checkpoint owner KPI capture",
      subjectType: "performance_kpi",
      subjectId: KPI_VERSION_ID,
      payload: { scopeNodeId: referenceTarget.scopeNodeId, period: CURRENT_PERIOD },
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
    where: { id: CADENCE_INSTANCE_ID },
    update: {
      cadenceDefinitionId: definition.id,
      sequence: 1,
      occurrenceAt: now,
      periodKey: CURRENT_PERIOD,
      windowOpensAt: now,
      windowClosingAt: dueAt,
      windowClosesAt: dueAt,
      reviewDueAt: dueAt,
      status: "OPEN",
      payloadSnapshot: { scopeNodeId: referenceTarget.scopeNodeId, period: CURRENT_PERIOD },
    },
    create: {
      id: CADENCE_INSTANCE_ID,
      cadenceDefinitionId: definition.id,
      sequence: 1,
      occurrenceAt: now,
      periodKey: CURRENT_PERIOD,
      windowOpensAt: now,
      windowClosingAt: dueAt,
      windowClosesAt: dueAt,
      reviewDueAt: dueAt,
      status: "OPEN",
      payloadSnapshot: { scopeNodeId: referenceTarget.scopeNodeId, period: CURRENT_PERIOD },
    },
  });

  console.log(JSON.stringify({
    erinId: erin.id,
    kpiDefinitionId: KPI_DEFINITION_ID,
    kpiVersionId: KPI_VERSION_ID,
    kpiName: KPI_NAME,
    cadenceDefinitionId: definition.id,
    cadenceInstanceId: CADENCE_INSTANCE_ID,
  }));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
