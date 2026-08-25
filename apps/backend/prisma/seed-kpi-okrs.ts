import "dotenv/config";
import { createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

function stableUuid(label: string): string {
  const hex = createHash("sha256").update(`kpi-okr-demo:${label}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][parseInt(hex[16]!, 16) % 4]!;
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

type KpiSeed = {
  slug: string;
  name: string;
  description: string;
  objective: string;
  unit: string;
  polarity: "higher_is_better" | "lower_is_better";
  frequency: "monthly" | "quarterly";
  source: "manual" | "feed";
  target: number;
  values: number[];
};

type OkrSeed = {
  slug: string;
  objective: string;
  name: string;
  keyResults: Array<{ slug: string; title: string; target: number; current: number; unit: string }>;
};

const MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];

const kpis: KpiSeed[] = [
  { slug: "revenue-growth", name: "Revenue Growth (YoY)", description: "Year-over-year enterprise revenue growth across recurring and strategic business.", objective: "Grow Revenue 20% YoY", unit: "%", polarity: "higher_is_better", frequency: "monthly", source: "feed", target: 40, values: [31, 33, 35, 36, 37, 38] },
  { slug: "gross-margin", name: "Gross Margin", description: "Gross margin after direct delivery and service costs.", objective: "Improve Operating Margin", unit: "%", polarity: "higher_is_better", frequency: "monthly", source: "feed", target: 70, values: [62, 64, 65, 66, 67, 68] },
  { slug: "nps", name: "Net Promoter Score", description: "Customer advocacy measured through enterprise Net Promoter Score.", objective: "Raise Customer Advocacy", unit: "score", polarity: "higher_is_better", frequency: "quarterly", source: "manual", target: 78, values: [70, 73, 75, 77, 79, 81] },
  { slug: "retention", name: "Customer Retention Rate", description: "Percentage of strategic customers retained over the reporting period.", objective: "Reduce Customer Churn", unit: "%", polarity: "higher_is_better", frequency: "monthly", source: "feed", target: 92, values: [89, 90, 91, 92, 93, 94] },
  { slug: "automation", name: "Automation Coverage", description: "Share of identified high-volume workflows with production-grade automation.", objective: "Automate Core Workflows", unit: "%", polarity: "higher_is_better", frequency: "monthly", source: "feed", target: 70, values: [45, 49, 53, 56, 60, 63] },
  { slug: "engagement", name: "Employee Engagement", description: "Enterprise engagement index from the latest employee pulse survey.", objective: "Boost Employee Engagement", unit: "%", polarity: "higher_is_better", frequency: "quarterly", source: "manual", target: 82, values: [79, 81, 83, 85, 86, 88] },
  { slug: "new-arr", name: "New ARR", description: "New annual recurring revenue closed from enterprise and strategic accounts.", objective: "Grow New ARR", unit: "$M", polarity: "higher_is_better", frequency: "monthly", source: "feed", target: 20, values: [11.2, 12.8, 14.1, 15.6, 17.2, 18.6] },
  { slug: "enterprise-win-rate", name: "Enterprise Win Rate", description: "Win rate across qualified enterprise opportunities reaching commercial stage.", objective: "Improve Enterprise Win Rate", unit: "%", polarity: "higher_is_better", frequency: "monthly", source: "feed", target: 35, values: [36, 35, 34, 33, 32, 31] },
  { slug: "marketing-roi", name: "Marketing ROI", description: "Revenue contribution generated per unit of marketing investment.", objective: "Improve Marketing ROI", unit: "x", polarity: "higher_is_better", frequency: "monthly", source: "feed", target: 3, values: [3, 2.8, 2.6, 2.4, 2.2, 2.1] },
  { slug: "cac", name: "Customer Acquisition Cost", description: "Average fully loaded cost to acquire a new enterprise customer.", objective: "Reduce Acquisition Cost", unit: "$", polarity: "lower_is_better", frequency: "monthly", source: "feed", target: 4600, values: [4700, 4800, 4920, 5050, 5160, 5240] },
  { slug: "on-time-delivery", name: "On-Time Delivery", description: "Percentage of committed deliveries completed by the agreed customer date.", objective: "Improve On-Time Delivery", unit: "%", polarity: "higher_is_better", frequency: "monthly", source: "feed", target: 95, values: [91, 92, 93, 94, 95, 96] },
  { slug: "platform-availability", name: "Platform Availability", description: "Availability of customer-facing strategic digital platforms.", objective: "Strengthen Platform Reliability", unit: "%", polarity: "higher_is_better", frequency: "monthly", source: "feed", target: 99.9, values: [99.8, 99.85, 99.9, 99.92, 99.93, 99.95] },
  { slug: "digital-adoption", name: "Digital Adoption Rate", description: "Share of eligible users actively completing priority journeys digitally.", objective: "Increase Digital Adoption", unit: "%", polarity: "higher_is_better", frequency: "monthly", source: "feed", target: 82, values: [61, 64, 67, 70, 72, 74] },
  { slug: "first-contact-resolution", name: "First Contact Resolution", description: "Percentage of customer issues resolved during the first service interaction.", objective: "Resolve Issues First Time", unit: "%", polarity: "higher_is_better", frequency: "monthly", source: "feed", target: 82, values: [75, 78, 80, 82, 84, 86] },
  { slug: "customer-lifetime-value", name: "Customer Lifetime Value", description: "Average expected lifetime value of strategic customer relationships.", objective: "Grow Customer Lifetime Value", unit: "$K", polarity: "higher_is_better", frequency: "quarterly", source: "feed", target: 140, values: [126, 131, 135, 139, 144, 148] },
];

const okrs: OkrSeed[] = [
  { slug: "profitable-growth", objective: "Grow Revenue 20% YoY", name: "Accelerate profitable enterprise growth", keyResults: [
    { slug: "revenue", title: "Reach 40% YoY revenue growth", target: 40, current: 38, unit: "%" },
    { slug: "margin", title: "Maintain gross margin above 68%", target: 68, current: 68, unit: "%" },
    { slug: "enterprise", title: "Add 50 strategic enterprise accounts", target: 50, current: 43, unit: "count" },
  ] },
  { slug: "customer-loyalty", objective: "Reduce Customer Churn", name: "Create a loyalty-led customer growth engine", keyResults: [
    { slug: "retention", title: "Increase customer retention to 95%", target: 95, current: 94, unit: "%" },
    { slug: "nps", title: "Raise NPS to 82", target: 82, current: 81, unit: "score" },
    { slug: "risk", title: "Reduce high-risk strategic accounts to 10", target: 10, current: 13, unit: "count" },
  ] },
  { slug: "sales-excellence", objective: "Improve Enterprise Win Rate", name: "Build a predictable enterprise sales engine", keyResults: [
    { slug: "win-rate", title: "Increase enterprise win rate to 35%", target: 35, current: 31, unit: "%" },
    { slug: "cycle", title: "Reduce median deal cycle to 40 days", target: 40, current: 42, unit: "days" },
    { slug: "forecast", title: "Reach 90% forecast accuracy", target: 90, current: 84, unit: "%" },
  ] },
  { slug: "marketing-efficiency", objective: "Improve Marketing ROI", name: "Restore efficient demand generation", keyResults: [
    { slug: "roi", title: "Increase marketing ROI to 3.0x", target: 3, current: 2.1, unit: "x" },
    { slug: "cac", title: "Reduce acquisition cost to 4,600", target: 4600, current: 5240, unit: "$" },
    { slug: "conversion", title: "Increase lead conversion to 14%", target: 14, current: 9, unit: "%" },
  ] },
  { slug: "digital-scale", objective: "Increase Digital Adoption", name: "Scale trusted digital adoption", keyResults: [
    { slug: "adoption", title: "Reach 82% digital adoption", target: 82, current: 74, unit: "%" },
    { slug: "availability", title: "Maintain 99.9% platform availability", target: 99.9, current: 99.95, unit: "%" },
    { slug: "automation", title: "Automate 70% of priority workflows", target: 70, current: 58, unit: "%" },
  ] },
  { slug: "cx-excellence", objective: "Increase Customer Advocacy", name: "Make priority customer journeys effortless", keyResults: [
    { slug: "advocacy", title: "Raise NPS to 80", target: 80, current: 76, unit: "score" },
    { slug: "fcr", title: "Reach 88% first-contact resolution", target: 88, current: 86, unit: "%" },
    { slug: "response", title: "Reduce average response time to 3 hours", target: 3, current: 3.6, unit: "hours" },
  ] },
];

type ObjectiveRow = { id: string; planVersionId: string; name: string };

async function objectiveByName(name: string): Promise<ObjectiveRow> {
  const rows = await prisma.$queryRaw<ObjectiveRow[]>`
    SELECT n.id, n.plan_version_id AS "planVersionId", n.name_en AS name
    FROM scorecard.objective_profiles op
    JOIN strategy.strategy_nodes n ON n.id = op.objective_node_id
    WHERE n.name_en = ${name}
      AND n.state <> 'retired'::strategy."StrategyNodeState"
    ORDER BY op.updated_at DESC, n.id
    LIMIT 1`;
  if (!rows[0]) throw new Error(`Required strategic objective not found: ${name}. Run seed-balanced-scorecards.ts first.`);
  return rows[0];
}

async function main() {
  const users = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM iam.users ORDER BY created_at, id LIMIT 1`;
  const userId = users[0]?.id;
  if (!userId) throw new Error("At least one IAM user is required before seeding KPI/OKR data");

  const objectiveNames = Array.from(new Set([...kpis.map((item) => item.objective), ...okrs.map((item) => item.objective)]));
  const objectiveMap = new Map<string, ObjectiveRow>();
  for (const name of objectiveNames) objectiveMap.set(name, await objectiveByName(name));

  for (const seed of kpis) {
    const objective = objectiveMap.get(seed.objective)!;
    const definitionId = stableUuid(`kpi-definition:${seed.slug}`);
    const versionId = stableUuid(`kpi-version:${seed.slug}:1`);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO registry.kpi_definitions (id, active_version_id, status, retired_at, created_at, updated_at)
        VALUES (${definitionId}, NULL, 'active'::registry."KpiStatus", NULL, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET status = 'active'::registry."KpiStatus", retired_at = NULL, updated_at = NOW()`;

      await tx.$executeRaw`
        INSERT INTO registry.kpi_versions (
          id, kpi_definition_id, version, name_en, name_ar, description_en, description_ar,
          unit, polarity, frequency, data_source_type, calculation_logic_text, owner_user_id,
          steward_user_id, active_from, supersedes_version_id, approval_case_id, published_at, created_at
        ) VALUES (
          ${versionId}, ${definitionId}, 1, ${seed.name}, ${seed.name}, ${seed.description}, NULL,
          ${seed.unit}, ${seed.polarity}::registry."KpiPolarity", ${seed.frequency}::registry."KpiFrequency",
          ${seed.source}::registry."KpiDataSourceType", 'Latest submitted value compared with approved target.',
          ${userId}, NULL, ${new Date("2026-01-01T00:00:00Z")}, NULL, NULL, NOW(), NOW()
        ) ON CONFLICT (id) DO NOTHING`;

      await tx.$executeRaw`
        UPDATE registry.kpi_definitions
        SET active_version_id = ${versionId}, status = 'active'::registry."KpiStatus", updated_at = NOW()
        WHERE id = ${definitionId}`;

      const alignmentId = stableUuid(`alignment:${seed.slug}`);
      await tx.$executeRaw`
        INSERT INTO registry.alignments (id, kpi_definition_id, strategy_node_id, alignment_type, created_at)
        VALUES (${alignmentId}, ${definitionId}, ${objective.id}::uuid, 'objective'::registry."AlignmentType", NOW())
        ON CONFLICT (kpi_definition_id, strategy_node_id, alignment_type) DO NOTHING`;

      for (const [index, period] of MONTHS.entries()) {
        const measurementId = stableUuid(`measurement:${seed.slug}:${period}`);
        const targetId = stableUuid(`target:${seed.slug}:${period}`);
        await tx.$executeRaw`
          INSERT INTO performance.measurements (
            id, kpi_version_id, scope_node_id, period, value, source, locked, supersedes_id,
            submitted_by, evidence_ref, created_at
          ) VALUES (
            ${measurementId}, ${versionId}, ${objective.id}::uuid, ${period}, ${seed.values[index]},
            ${seed.source}::performance."MeasurementSource", false, NULL, ${userId}, 'demo://professional-kpi-seed', NOW()
          ) ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source`;

        await tx.$executeRaw`
          INSERT INTO performance.target_series (
            id, kpi_version_id, scope_node_id, period, target_value, plan_version_id, created_at, updated_at
          ) VALUES (
            ${targetId}, ${versionId}, ${objective.id}::uuid, ${period}, ${seed.target}, ${objective.planVersionId}::uuid, NOW(), NOW()
          ) ON CONFLICT (id) DO UPDATE SET target_value = EXCLUDED.target_value, updated_at = NOW()`;
      }
    });
  }

  for (const seed of okrs) {
    const objective = objectiveMap.get(seed.objective)!;
    const okrId = stableUuid(`okr:${seed.slug}`);
    await prisma.$executeRaw`
      INSERT INTO registry.okrs (id, objective_node_id, name_en, name_ar, created_at, updated_at)
      VALUES (${okrId}, ${objective.id}::uuid, ${seed.name}, ${seed.name}, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET objective_node_id = EXCLUDED.objective_node_id, name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar, updated_at = NOW()`;

    for (const keyResult of seed.keyResults) {
      const keyResultId = stableUuid(`key-result:${seed.slug}:${keyResult.slug}`);
      await prisma.$executeRaw`
        INSERT INTO registry.key_results (
          id, okr_id, type, title_en, title_ar, target_value, unit, current_value,
          progress_updated_at, created_at, updated_at
        ) VALUES (
          ${keyResultId}, ${okrId}, 'quantitative'::registry."KeyResultType", ${keyResult.title}, ${keyResult.title},
          ${keyResult.target}, ${keyResult.unit}, ${keyResult.current}, NOW(), NOW(), NOW()
        ) ON CONFLICT (id) DO UPDATE SET
          okr_id = EXCLUDED.okr_id, title_en = EXCLUDED.title_en, title_ar = EXCLUDED.title_ar,
          target_value = EXCLUDED.target_value, unit = EXCLUDED.unit, current_value = EXCLUDED.current_value,
          progress_updated_at = NOW(), updated_at = NOW()`;
    }
  }

  console.log(`Seeded persisted KPI/OKR workspace: ${kpis.length} KPIs with ${kpis.length * MONTHS.length} measurements and ${okrs.length} OKRs with ${okrs.reduce((sum, item) => sum + item.keyResults.length, 0)} key results`);
}

main()
  .catch((error: unknown) => {
    console.error("KPI/OKR seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
