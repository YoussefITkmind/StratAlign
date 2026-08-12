import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * Deterministic Prompt 3.1/3.2/3.3 E2E fixture: a real Scorecard with two
 * perspectives, each with one placed objective aligned to a real KPI with a
 * computed status, plus a published StrategyMap linking those objectives.
 * Bypasses the governance-gated mutation flow for the initial state (this is
 * seed setup, not a test of the approval workflow itself) — the map-canvas
 * E2E test then drives a *second* real edit/approve/publish cycle through the
 * actual APIs on top of this base state.
 */
const PLAN_ID = "84000000-0000-4000-8000-000000000001";
const OBJECTIVE_REVENUE_ID = "84000000-0000-4000-8000-000000000002";
const OBJECTIVE_CSAT_ID = "84000000-0000-4000-8000-000000000003";
const KPI_REVENUE_DEF_ID = "84000000-0000-4000-8000-000000000004";
const KPI_REVENUE_VERSION_ID = "84000000-0000-4000-8000-000000000005";
const KPI_CSAT_DEF_ID = "84000000-0000-4000-8000-000000000006";
const KPI_CSAT_VERSION_ID = "84000000-0000-4000-8000-000000000007";
const THRESHOLD_RULE_ID = "84000000-0000-4000-8000-000000000008";
const RAG_RULE_ID = "84000000-0000-4000-8000-000000000009";
export const SCORECARD_ID = "84000000-0000-4000-8000-000000000010";
const PERSPECTIVE_FINANCIAL_ID = "84000000-0000-4000-8000-000000000011";
const PERSPECTIVE_CUSTOMER_ID = "84000000-0000-4000-8000-000000000012";
const WEIGHTING_VERSION_ID = "84000000-0000-4000-8000-000000000013";
const STRATEGY_MAP_ID = "84000000-0000-4000-8000-000000000014";
const MAP_LINK_ID = "84000000-0000-4000-8000-000000000015";
const ALIGNMENT_REVENUE_ID = "84000000-0000-4000-8000-000000000016";
const ALIGNMENT_CSAT_ID = "84000000-0000-4000-8000-000000000017";
const MEASUREMENT_REVENUE_ID = "84000000-0000-4000-8000-000000000018";
const MEASUREMENT_CSAT_ID = "84000000-0000-4000-8000-000000000019";
const TARGET_REVENUE_ID = "84000000-0000-4000-8000-00000000001a";
const TARGET_CSAT_ID = "84000000-0000-4000-8000-00000000001b";
const STATUS_REVENUE_ID = "84000000-0000-4000-8000-00000000001c";
const STATUS_CSAT_ID = "84000000-0000-4000-8000-00000000001d";

export const PERIOD = "2026-08";
export const REVENUE_KPI_NAME = "E2E Revenue Growth";
export const CSAT_KPI_NAME = "E2E Customer Satisfaction";
export const REVENUE_OBJECTIVE_ID = OBJECTIVE_REVENUE_ID;
export const CSAT_OBJECTIVE_ID = OBJECTIVE_CSAT_ID;

async function main() {
  const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@example.test" } });
  const bob = await prisma.user.findUniqueOrThrow({ where: { email: "bob@example.test" } });

  await prisma.planVersion.upsert({
    where: { id: PLAN_ID },
    update: { name: "Phase 3.2/3.3 Scorecard E2E Plan", status: "ACTIVE" },
    create: { id: PLAN_ID, name: "Phase 3.2/3.3 Scorecard E2E Plan", status: "ACTIVE" },
  });

  const revenueObjective = await prisma.strategyNode.upsert({
    where: { id: OBJECTIVE_REVENUE_ID },
    update: { nameEn: "Grow Revenue", nameAr: "زيادة الإيرادات", state: "ACTIVE" },
    create: {
      id: OBJECTIVE_REVENUE_ID, type: "OBJECTIVE", nameEn: "Grow Revenue", nameAr: "زيادة الإيرادات",
      planVersionId: PLAN_ID, state: "ACTIVE", createdBy: bob.id,
    },
  });
  const csatObjective = await prisma.strategyNode.upsert({
    where: { id: OBJECTIVE_CSAT_ID },
    update: { nameEn: "Improve Customer Satisfaction", nameAr: "تحسين رضا العملاء", state: "ACTIVE" },
    create: {
      id: OBJECTIVE_CSAT_ID, type: "OBJECTIVE", nameEn: "Improve Customer Satisfaction", nameAr: "تحسين رضا العملاء",
      planVersionId: PLAN_ID, state: "ACTIVE", createdBy: bob.id,
    },
  });

  await prisma.ruleDefinition.upsert({
    where: { id: THRESHOLD_RULE_ID },
    update: {},
    create: {
      id: THRESHOLD_RULE_ID, ruleKey: "e2e-scorecard-threshold", ruleType: "THRESHOLD_STATUS",
      name: "E2E Scorecard KPI Threshold", version: 1, status: "PUBLISHED", isCurrent: true,
      publishedAt: new Date(), createdById: bob.id,
      documentJson: {
        ruleType: "threshold_status", direction: "higher_is_better",
        bands: [
          { label: "On Track", color: "green", comparator: "gte", value: 100 },
          { label: "Watch", color: "amber", comparator: "gte", value: 80 },
          { label: "Off Track", color: "red", comparator: "gte", value: 0 },
        ],
      },
    },
  });
  await prisma.ruleDefinition.upsert({
    where: { id: RAG_RULE_ID },
    update: {},
    create: {
      id: RAG_RULE_ID, ruleKey: "e2e-scorecard-rag", ruleType: "RAG_AGGREGATION",
      name: "E2E Scorecard Perspective Roll-up", version: 1, status: "PUBLISHED", isCurrent: true,
      publishedAt: new Date(), createdById: bob.id,
      documentJson: { ruleType: "rag_aggregation", method: "weighted_count", watchThreshold: 0.34, offTrackThreshold: 0.67 },
    },
  });

  await prisma.kpiDefinition.upsert({ where: { id: KPI_REVENUE_DEF_ID }, update: { status: "ACTIVE" }, create: { id: KPI_REVENUE_DEF_ID, status: "ACTIVE" } });
  await prisma.kpiVersion.upsert({
    where: { id: KPI_REVENUE_VERSION_ID },
    update: {},
    create: {
      id: KPI_REVENUE_VERSION_ID, kpiDefinitionId: KPI_REVENUE_DEF_ID, version: 1,
      nameEn: REVENUE_KPI_NAME, nameAr: "نمو الإيرادات (اختبار)", unit: "%",
      polarity: "HIGHER_IS_BETTER", frequency: "MONTHLY", dataSourceType: "MANUAL",
      ownerUserId: alice.id, activeFrom: new Date("2026-07-01T00:00:00Z"), publishedAt: new Date("2026-07-01T00:00:00Z"),
    },
  });
  await prisma.kpiDefinition.update({ where: { id: KPI_REVENUE_DEF_ID }, data: { activeVersionId: KPI_REVENUE_VERSION_ID } });

  await prisma.kpiDefinition.upsert({ where: { id: KPI_CSAT_DEF_ID }, update: { status: "ACTIVE" }, create: { id: KPI_CSAT_DEF_ID, status: "ACTIVE" } });
  await prisma.kpiVersion.upsert({
    where: { id: KPI_CSAT_VERSION_ID },
    update: {},
    create: {
      id: KPI_CSAT_VERSION_ID, kpiDefinitionId: KPI_CSAT_DEF_ID, version: 1,
      nameEn: CSAT_KPI_NAME, nameAr: "رضا العملاء (اختبار)", unit: "%",
      polarity: "HIGHER_IS_BETTER", frequency: "MONTHLY", dataSourceType: "MANUAL",
      ownerUserId: alice.id, activeFrom: new Date("2026-07-01T00:00:00Z"), publishedAt: new Date("2026-07-01T00:00:00Z"),
    },
  });
  await prisma.kpiDefinition.update({ where: { id: KPI_CSAT_DEF_ID }, data: { activeVersionId: KPI_CSAT_VERSION_ID } });

  await prisma.alignment.upsert({
    where: { id: ALIGNMENT_REVENUE_ID },
    update: {},
    create: { id: ALIGNMENT_REVENUE_ID, kpiDefinitionId: KPI_REVENUE_DEF_ID, strategyNodeId: revenueObjective.id, alignmentType: "OBJECTIVE" },
  });
  await prisma.alignment.upsert({
    where: { id: ALIGNMENT_CSAT_ID },
    update: {},
    create: { id: ALIGNMENT_CSAT_ID, kpiDefinitionId: KPI_CSAT_DEF_ID, strategyNodeId: csatObjective.id, alignmentType: "OBJECTIVE" },
  });

  await prisma.targetSeries.upsert({
    where: { id: TARGET_REVENUE_ID },
    update: {},
    create: { id: TARGET_REVENUE_ID, kpiVersionId: KPI_REVENUE_VERSION_ID, scopeNodeId: revenueObjective.id, period: PERIOD, targetValue: 100, planVersionId: PLAN_ID },
  });
  await prisma.targetSeries.upsert({
    where: { id: TARGET_CSAT_ID },
    update: {},
    create: { id: TARGET_CSAT_ID, kpiVersionId: KPI_CSAT_VERSION_ID, scopeNodeId: csatObjective.id, period: PERIOD, targetValue: 90, planVersionId: PLAN_ID },
  });

  await prisma.measurement.upsert({
    where: { id: MEASUREMENT_REVENUE_ID },
    update: {},
    create: { id: MEASUREMENT_REVENUE_ID, kpiVersionId: KPI_REVENUE_VERSION_ID, scopeNodeId: revenueObjective.id, period: PERIOD, value: 108, source: "MANUAL", submittedById: alice.id },
  });
  await prisma.measurement.upsert({
    where: { id: MEASUREMENT_CSAT_ID },
    update: {},
    create: { id: MEASUREMENT_CSAT_ID, kpiVersionId: KPI_CSAT_VERSION_ID, scopeNodeId: csatObjective.id, period: PERIOD, value: 72, source: "MANUAL", submittedById: alice.id },
  });

  await prisma.statusResult.upsert({
    where: { id: STATUS_REVENUE_ID },
    update: { status: "On Track" },
    create: {
      id: STATUS_REVENUE_ID, kpiVersionId: KPI_REVENUE_VERSION_ID, scopeNodeId: revenueObjective.id, period: PERIOD,
      status: "On Track", ruleVersionUsed: THRESHOLD_RULE_ID, dedupeKey: `e2e-scorecard-status-${KPI_REVENUE_VERSION_ID}-${PERIOD}`,
    },
  });
  await prisma.statusResult.upsert({
    where: { id: STATUS_CSAT_ID },
    update: { status: "Off Track" },
    create: {
      id: STATUS_CSAT_ID, kpiVersionId: KPI_CSAT_VERSION_ID, scopeNodeId: csatObjective.id, period: PERIOD,
      status: "Off Track", ruleVersionUsed: THRESHOLD_RULE_ID, dedupeKey: `e2e-scorecard-status-${KPI_CSAT_VERSION_ID}-${PERIOD}`,
    },
  });

  await prisma.scorecard.upsert({
    where: { id: SCORECARD_ID },
    update: { nameEn: "E2E Corporate Scorecard", nameAr: "بطاقة الأداء المؤسسية (اختبار)" },
    create: { id: SCORECARD_ID, nameEn: "E2E Corporate Scorecard", nameAr: "بطاقة الأداء المؤسسية (اختبار)", planVersionId: PLAN_ID },
  });
  await prisma.perspective.upsert({
    where: { id: PERSPECTIVE_FINANCIAL_ID },
    update: {},
    create: { id: PERSPECTIVE_FINANCIAL_ID, scorecardId: SCORECARD_ID, nameEn: "Financial", nameAr: "المالية", order: 0 },
  });
  await prisma.perspective.upsert({
    where: { id: PERSPECTIVE_CUSTOMER_ID },
    update: {},
    create: { id: PERSPECTIVE_CUSTOMER_ID, scorecardId: SCORECARD_ID, nameEn: "Customer", nameAr: "العميل", order: 1 },
  });

  await prisma.placement.upsert({
    where: { perspectiveId_objectiveNodeId: { perspectiveId: PERSPECTIVE_FINANCIAL_ID, objectiveNodeId: revenueObjective.id } },
    update: {},
    create: { perspectiveId: PERSPECTIVE_FINANCIAL_ID, objectiveNodeId: revenueObjective.id },
  });
  await prisma.placement.upsert({
    where: { perspectiveId_objectiveNodeId: { perspectiveId: PERSPECTIVE_CUSTOMER_ID, objectiveNodeId: csatObjective.id } },
    update: {},
    create: { perspectiveId: PERSPECTIVE_CUSTOMER_ID, objectiveNodeId: csatObjective.id },
  });

  await prisma.weightingVersion.upsert({
    where: { id: WEIGHTING_VERSION_ID },
    update: { perspectiveWeights: { [PERSPECTIVE_FINANCIAL_ID]: 60, [PERSPECTIVE_CUSTOMER_ID]: 40 } },
    create: {
      id: WEIGHTING_VERSION_ID, scorecardId: SCORECARD_ID,
      perspectiveWeights: { [PERSPECTIVE_FINANCIAL_ID]: 60, [PERSPECTIVE_CUSTOMER_ID]: 40 },
      scoringFormulaId: RAG_RULE_ID, activeFrom: new Date("2026-08-01T00:00:00Z"),
    },
  });

  await prisma.strategyMap.upsert({
    where: { id: STRATEGY_MAP_ID },
    update: { state: "PUBLISHED" },
    create: { id: STRATEGY_MAP_ID, scorecardId: SCORECARD_ID, state: "PUBLISHED" },
  });
  await prisma.mapLink.upsert({
    where: { strategyMapId_fromObjectiveId_toObjectiveId: { strategyMapId: STRATEGY_MAP_ID, fromObjectiveId: revenueObjective.id, toObjectiveId: csatObjective.id } },
    update: {},
    create: { id: MAP_LINK_ID, strategyMapId: STRATEGY_MAP_ID, fromObjectiveId: revenueObjective.id, toObjectiveId: csatObjective.id, strength: "STRONG" },
  });

  console.log(JSON.stringify({
    scorecardId: SCORECARD_ID,
    revenueKpiDefinitionId: KPI_REVENUE_DEF_ID,
    csatKpiDefinitionId: KPI_CSAT_DEF_ID,
    revenueObjectiveId: REVENUE_OBJECTIVE_ID,
    csatObjectiveId: CSAT_OBJECTIVE_ID,
    aliceId: alice.id,
    bobId: bob.id,
  }));
}

main()
  .catch((error: unknown) => { console.error("Scorecard E2E seed failed", error); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
