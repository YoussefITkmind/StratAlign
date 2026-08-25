import "dotenv/config";
import { createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

function stableUuid(label: string): string {
  const hex = createHash("sha256").update(`balanced-scorecard:${label}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][parseInt(hex[16]!, 16) % 4]!;
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

const PLAN_ID = stableUuid("demo-plan");

type Status = "on-track" | "at-risk" | "draft";
type PerspectiveKey = "financial" | "customer" | "internal-process" | "learning-growth";

type SeedKpi = {
  name: string;
  status: Status;
  score: number;
  priorScore?: number;
  weight: number;
  actual: string;
  target: string;
  variance: string;
  trend: number[];
};

type SeedPerspective = {
  key: PerspectiveKey;
  score: number;
  priorScore?: number;
  weight: number;
  ownerInitials: string;
  ownerColor: string;
  kpis: SeedKpi[];
};

type SeedScorecard = {
  slug: string;
  name: string;
  description: string;
  department: string;
  period: string;
  ownerName: string;
  ownerInitials: string;
  status: Status;
  score: number;
  priorScore?: number;
  strategyName: string;
  strategicTheme: string;
  strategicObjective: string;
  primaryPerspective: PerspectiveKey | "all";
  strategicWeight: number;
  tags: string[];
  perspectives: SeedPerspective[];
};

const cards: SeedScorecard[] = [
  {
    slug: "corporate",
    name: "Corporate Strategy Scorecard",
    description: "Executive view of enterprise growth, customer, process and people performance.",
    department: "Corporate",
    period: "Q3 2026",
    ownerName: "Alex Morgan",
    ownerInitials: "AM",
    status: "on-track",
    score: 82,
    priorScore: 77,
    strategyName: "Enterprise Strategy 2026–2028",
    strategicTheme: "Sustainable Growth",
    strategicObjective: "Grow profitably while improving customer value",
    primaryPerspective: "all",
    strategicWeight: 30,
    tags: ["corporate", "strategy", "executive"],
    perspectives: [
      { key: "financial", score: 78, priorScore: 73, weight: 35, ownerInitials: "SC", ownerColor: "bg-indigo-500", kpis: [
        { name: "Revenue Growth (YoY)", status: "on-track", score: 95, priorScore: 90, weight: 50, actual: "38%", target: "40%", variance: "-2%", trend: [31, 33, 35, 36, 37, 38] },
        { name: "Gross Margin", status: "on-track", score: 88, priorScore: 84, weight: 50, actual: "68%", target: "70%", variance: "-2%", trend: [62, 64, 65, 66, 67, 68] },
      ]},
      { key: "customer", score: 84, priorScore: 80, weight: 25, ownerInitials: "PN", ownerColor: "bg-blue-500", kpis: [
        { name: "Net Promoter Score", status: "on-track", score: 90, priorScore: 85, weight: 50, actual: "81", target: "78", variance: "+3", trend: [70, 73, 75, 77, 79, 81] },
        { name: "Customer Retention Rate", status: "on-track", score: 86, priorScore: 82, weight: 50, actual: "94%", target: "92%", variance: "+2%", trend: [89, 90, 91, 92, 93, 94] },
      ]},
      { key: "internal-process", score: 74, priorScore: 76, weight: 25, ownerInitials: "TR", ownerColor: "bg-emerald-500", kpis: [
        { name: "Process Cycle Time", status: "at-risk", score: 63, priorScore: 69, weight: 50, actual: "5.8 days", target: "5.0 days", variance: "+0.8 days", trend: [6.8, 6.5, 6.3, 6.1, 5.9, 5.8] },
        { name: "Quality Index", status: "on-track", score: 91, priorScore: 88, weight: 50, actual: "91%", target: "88%", variance: "+3%", trend: [84, 86, 87, 89, 90, 91] },
      ]},
      { key: "learning-growth", score: 91, priorScore: 86, weight: 15, ownerInitials: "JP", ownerColor: "bg-amber-500", kpis: [
        { name: "Employee Engagement", status: "on-track", score: 88, priorScore: 84, weight: 50, actual: "88%", target: "82%", variance: "+6%", trend: [79, 81, 83, 85, 86, 88] },
        { name: "Leadership Bench Strength", status: "on-track", score: 92, priorScore: 87, weight: 50, actual: "92%", target: "85%", variance: "+7%", trend: [80, 83, 85, 87, 90, 92] },
      ]},
    ],
  },
  {
    slug: "sales",
    name: "Sales Performance Scorecard",
    description: "Tracks pipeline health, conversion, sales efficiency and capability.",
    department: "Sales",
    period: "Q3 2026",
    ownerName: "Jamie Park",
    ownerInitials: "JP",
    status: "on-track",
    score: 76,
    priorScore: 73,
    strategyName: "Commercial Growth Plan 2026",
    strategicTheme: "Revenue Acceleration",
    strategicObjective: "Increase enterprise win rate and recurring revenue",
    primaryPerspective: "financial",
    strategicWeight: 25,
    tags: ["sales", "pipeline", "growth"],
    perspectives: [
      { key: "financial", score: 80, priorScore: 77, weight: 35, ownerInitials: "JP", ownerColor: "bg-indigo-500", kpis: [
        { name: "Pipeline Coverage Ratio", status: "on-track", score: 84, priorScore: 80, weight: 50, actual: "3.4x", target: "3.0x", variance: "+0.4x", trend: [2.7, 2.9, 3.0, 3.1, 3.3, 3.4] },
        { name: "Enterprise Win Rate", status: "at-risk", score: 68, priorScore: 72, weight: 50, actual: "31%", target: "35%", variance: "-4%", trend: [36, 35, 34, 33, 32, 31] },
      ]},
      { key: "customer", score: 75, priorScore: 72, weight: 25, ownerInitials: "DC", ownerColor: "bg-blue-500", kpis: [
        { name: "Sales Qualified Lead Conversion", status: "on-track", score: 79, priorScore: 75, weight: 100, actual: "24%", target: "22%", variance: "+2%", trend: [18, 19, 20, 21, 23, 24] },
      ]},
      { key: "internal-process", score: 73, priorScore: 71, weight: 25, ownerInitials: "JP", ownerColor: "bg-emerald-500", kpis: [
        { name: "Deal Cycle Time", status: "on-track", score: 82, priorScore: 77, weight: 100, actual: "42 days", target: "45 days", variance: "-3 days", trend: [49, 47, 46, 45, 44, 42] },
      ]},
      { key: "learning-growth", score: 78, priorScore: 74, weight: 15, ownerInitials: "DC", ownerColor: "bg-amber-500", kpis: [
        { name: "Sales Certification Rate", status: "on-track", score: 86, priorScore: 80, weight: 100, actual: "86%", target: "80%", variance: "+6%", trend: [72, 75, 78, 81, 83, 86] },
      ]},
    ],
  },
  {
    slug: "marketing",
    name: "Marketing Scorecard",
    description: "Measures marketing efficiency, demand generation, brand and team capability.",
    department: "Marketing",
    period: "Q3 2026",
    ownerName: "Priya Nair",
    ownerInitials: "PN",
    status: "at-risk",
    score: 64,
    priorScore: 69,
    strategyName: "Commercial Growth Plan 2026",
    strategicTheme: "Market Expansion",
    strategicObjective: "Improve qualified demand and brand reach",
    primaryPerspective: "customer",
    strategicWeight: 20,
    tags: ["marketing", "demand", "brand"],
    perspectives: [
      { key: "financial", score: 60, priorScore: 66, weight: 30, ownerInitials: "PN", ownerColor: "bg-indigo-500", kpis: [
        { name: "Marketing ROI", status: "at-risk", score: 58, priorScore: 64, weight: 100, actual: "2.1x", target: "3.0x", variance: "-0.9x", trend: [3.0, 2.8, 2.6, 2.4, 2.2, 2.1] },
      ]},
      { key: "customer", score: 69, priorScore: 71, weight: 30, ownerInitials: "PN", ownerColor: "bg-blue-500", kpis: [
        { name: "Brand Awareness Index", status: "on-track", score: 81, priorScore: 77, weight: 50, actual: "64%", target: "60%", variance: "+4%", trend: [52, 55, 58, 60, 62, 64] },
        { name: "Lead Conversion Rate", status: "at-risk", score: 54, priorScore: 61, weight: 50, actual: "9%", target: "14%", variance: "-5%", trend: [14, 13, 12, 11, 10, 9] },
      ]},
      { key: "internal-process", score: 61, priorScore: 65, weight: 25, ownerInitials: "TR", ownerColor: "bg-emerald-500", kpis: [
        { name: "Campaign Launch Cycle Time", status: "at-risk", score: 61, priorScore: 65, weight: 100, actual: "18 days", target: "14 days", variance: "+4 days", trend: [13, 14, 15, 16, 17, 18] },
      ]},
      { key: "learning-growth", score: 72, priorScore: 68, weight: 15, ownerInitials: "PN", ownerColor: "bg-amber-500", kpis: [
        { name: "Team Skills Coverage", status: "on-track", score: 79, priorScore: 74, weight: 100, actual: "79%", target: "75%", variance: "+4%", trend: [68, 70, 72, 74, 77, 79] },
      ]},
    ],
  },
  {
    slug: "operations",
    name: "Operations Excellence Scorecard",
    description: "Operational reliability, cost, quality and workforce readiness.",
    department: "Operations",
    period: "Q3 2026",
    ownerName: "Tom Reilly",
    ownerInitials: "TR",
    status: "draft",
    score: 0,
    strategyName: "Operational Excellence 2026",
    strategicTheme: "Reliable Delivery",
    strategicObjective: "Improve service reliability and reduce cost to serve",
    primaryPerspective: "internal-process",
    strategicWeight: 20,
    tags: ["operations", "quality", "efficiency"],
    perspectives: [
      { key: "financial", score: 0, weight: 30, ownerInitials: "TR", ownerColor: "bg-indigo-500", kpis: [] },
      { key: "customer", score: 0, weight: 25, ownerInitials: "TR", ownerColor: "bg-blue-500", kpis: [] },
      { key: "internal-process", score: 0, weight: 30, ownerInitials: "TR", ownerColor: "bg-emerald-500", kpis: [
        { name: "Supply Chain Reliability", status: "draft", score: 0, weight: 100, actual: "—", target: "95%", variance: "—", trend: [] },
      ]},
      { key: "learning-growth", score: 0, weight: 15, ownerInitials: "TR", ownerColor: "bg-amber-500", kpis: [] },
    ],
  },
  {
    slug: "technology",
    name: "Digital Transformation Scorecard",
    description: "Tracks digital adoption, platform reliability, automation and technology capability.",
    department: "Technology",
    period: "Q4 2026",
    ownerName: "Daniel Carter",
    ownerInitials: "DC",
    status: "at-risk",
    score: 71,
    priorScore: 74,
    strategyName: "Enterprise Digital Transformation 2025–2027",
    strategicTheme: "Digital Excellence",
    strategicObjective: "Increase digital adoption and operational efficiency",
    primaryPerspective: "internal-process",
    strategicWeight: 25,
    tags: ["digital", "transformation", "technology", "efficiency"],
    perspectives: [
      { key: "financial", score: 70, priorScore: 72, weight: 25, ownerInitials: "DC", ownerColor: "bg-indigo-500", kpis: [
        { name: "Technology Cost Efficiency", status: "on-track", score: 82, priorScore: 78, weight: 100, actual: "-8%", target: "-6%", variance: "-2%", trend: [-2, -3, -4, -5, -7, -8] },
      ]},
      { key: "customer", score: 68, priorScore: 71, weight: 25, ownerInitials: "DC", ownerColor: "bg-blue-500", kpis: [
        { name: "Digital Adoption Rate", status: "at-risk", score: 68, priorScore: 72, weight: 100, actual: "74%", target: "82%", variance: "-8%", trend: [61, 64, 67, 70, 72, 74] },
      ]},
      { key: "internal-process", score: 74, priorScore: 76, weight: 35, ownerInitials: "DC", ownerColor: "bg-emerald-500", kpis: [
        { name: "Platform Availability", status: "on-track", score: 96, priorScore: 94, weight: 50, actual: "99.95%", target: "99.9%", variance: "+0.05%", trend: [99.8, 99.85, 99.9, 99.92, 99.93, 99.95] },
        { name: "Automation Coverage", status: "at-risk", score: 63, priorScore: 68, weight: 50, actual: "58%", target: "70%", variance: "-12%", trend: [42, 45, 49, 52, 55, 58] },
      ]},
      { key: "learning-growth", score: 72, priorScore: 70, weight: 15, ownerInitials: "DC", ownerColor: "bg-amber-500", kpis: [
        { name: "Cloud Skills Coverage", status: "on-track", score: 80, priorScore: 74, weight: 100, actual: "80%", target: "75%", variance: "+5%", trend: [62, 65, 69, 72, 76, 80] },
      ]},
    ],
  },
];

function perspectiveName(key: PerspectiveKey): string {
  if (key === "financial") return "Financial";
  if (key === "customer") return "Customer";
  if (key === "internal-process") return "Internal Process";
  return "Learning & Growth";
}

async function main() {
  await prisma.planVersion.upsert({
    where: { id: PLAN_ID },
    update: { name: "Balanced Scorecard Demo Plan", status: "ACTIVE" },
    create: { id: PLAN_ID, name: "Balanced Scorecard Demo Plan", status: "ACTIVE" },
  });

  for (const card of cards) {
    const scorecardId = stableUuid(`scorecard:${card.slug}`);
    await prisma.$executeRaw`
      INSERT INTO scorecard.scorecards (
        id, name_en, name_ar, plan_version_id, description, department, period,
        owner_name, owner_initials, status, score, prior_score, review_frequency,
        start_period, end_period, strategy_name, strategic_theme, strategic_objective,
        primary_perspective, strategic_weight, tags, notes
      ) VALUES (
        ${scorecardId}::uuid, ${card.name}, ${card.name}, ${PLAN_ID}::uuid, ${card.description}, ${card.department}, ${card.period},
        ${card.ownerName}, ${card.ownerInitials}, ${card.status}, ${card.score}, ${card.priorScore ?? null}, 'Monthly',
        'Jan 2026', 'Dec 2026', ${card.strategyName}, ${card.strategicTheme}, ${card.strategicObjective},
        ${card.primaryPerspective}, ${card.strategicWeight}, ${card.tags}::text[], 'Seeded Balanced Scorecard test data'
      )
      ON CONFLICT (id) DO UPDATE SET
        name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar, description = EXCLUDED.description,
        department = EXCLUDED.department, period = EXCLUDED.period, owner_name = EXCLUDED.owner_name,
        owner_initials = EXCLUDED.owner_initials, status = EXCLUDED.status, score = EXCLUDED.score,
        prior_score = EXCLUDED.prior_score, review_frequency = EXCLUDED.review_frequency,
        strategy_name = EXCLUDED.strategy_name, strategic_theme = EXCLUDED.strategic_theme,
        strategic_objective = EXCLUDED.strategic_objective, primary_perspective = EXCLUDED.primary_perspective,
        strategic_weight = EXCLUDED.strategic_weight, tags = EXCLUDED.tags, notes = EXCLUDED.notes`;

    for (const [order, perspective] of card.perspectives.entries()) {
      const perspectiveId = stableUuid(`perspective:${card.slug}:${perspective.key}`);
      const name = perspectiveName(perspective.key);
      await prisma.$executeRaw`
        INSERT INTO scorecard.perspectives (
          id, scorecard_id, name_en, name_ar, "order", perspective_key,
          owner_initials, owner_color, score, prior_score, weight
        ) VALUES (
          ${perspectiveId}::uuid, ${scorecardId}::uuid, ${name}, ${name}, ${order}, ${perspective.key},
          ${perspective.ownerInitials}, ${perspective.ownerColor}, ${perspective.score}, ${perspective.priorScore ?? null}, ${perspective.weight}
        )
        ON CONFLICT (id) DO UPDATE SET
          name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar, "order" = EXCLUDED."order",
          perspective_key = EXCLUDED.perspective_key, owner_initials = EXCLUDED.owner_initials,
          owner_color = EXCLUDED.owner_color, score = EXCLUDED.score,
          prior_score = EXCLUDED.prior_score, weight = EXCLUDED.weight`;

      for (const [index, kpi] of perspective.kpis.entries()) {
        const kpiId = stableUuid(`kpi:${card.slug}:${perspective.key}:${index}:${kpi.name}`);
        await prisma.$executeRaw`
          INSERT INTO scorecard.kpi_snapshots (
            id, perspective_id, name, status, owner_initials, owner_color,
            score, prior_score, weight, actual, target, variance, trend
          ) VALUES (
            ${kpiId}::uuid, ${perspectiveId}::uuid, ${kpi.name}, ${kpi.status}, ${perspective.ownerInitials}, ${perspective.ownerColor},
            ${kpi.score}, ${kpi.priorScore ?? null}, ${kpi.weight}, ${kpi.actual}, ${kpi.target}, ${kpi.variance}, ${JSON.stringify(kpi.trend)}::jsonb
          )
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name, status = EXCLUDED.status, owner_initials = EXCLUDED.owner_initials,
            owner_color = EXCLUDED.owner_color, score = EXCLUDED.score, prior_score = EXCLUDED.prior_score,
            weight = EXCLUDED.weight, actual = EXCLUDED.actual, target = EXCLUDED.target,
            variance = EXCLUDED.variance, trend = EXCLUDED.trend`;
      }
    }
  }

  console.log(`Seeded ${cards.length} persisted Balanced Scorecards`);
}

main()
  .catch((error: unknown) => {
    console.error("Balanced Scorecard seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
