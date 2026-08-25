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
  actual: string;
  target: string;
  variance: string;
  trend: number[];
};

type SeedPerspective = {
  key: PerspectiveKey;
  score: number;
  weight: number;
  ownerInitials: string;
  ownerColor: string;
  kpis: SeedKpi[];
};

type SeedCard = {
  slug: string;
  name: string;
  department: string;
  period: string;
  ownerName: string;
  ownerInitials: string;
  status: Status;
  score: number;
  description: string;
  strategyName: string;
  strategicTheme: string;
  strategicObjective: string;
  primaryPerspective: PerspectiveKey | "all";
  tags: string[];
  perspectives: SeedPerspective[];
};

const ownerColor = {
  financial: "bg-indigo-500",
  customer: "bg-blue-500",
  "internal-process": "bg-emerald-500",
  "learning-growth": "bg-amber-500",
} satisfies Record<PerspectiveKey, string>;

function perspectives(initials: string, values: Partial<Record<PerspectiveKey, SeedKpi[]>>): SeedPerspective[] {
  const config: Array<[PerspectiveKey, number]> = [
    ["financial", 30],
    ["customer", 25],
    ["internal-process", 30],
    ["learning-growth", 15],
  ];
  return config.map(([key, weight]) => {
    const kpis = values[key] ?? [];
    const score = kpis.length === 0 ? 0 : Math.round(kpis.reduce((sum, kpi) => sum + kpi.score, 0) / kpis.length);
    return { key, score, weight, ownerInitials: initials, ownerColor: ownerColor[key], kpis };
  });
}

const cards: SeedCard[] = [
  {
    slug: "corporate",
    name: "Corporate Strategy Scorecard",
    department: "Corporate",
    period: "Q3 2026",
    ownerName: "Alex Morgan",
    ownerInitials: "AM",
    status: "on-track",
    score: 82,
    description: "Executive view of enterprise growth, customer, process and people performance.",
    strategyName: "Enterprise Strategy 2026–2028",
    strategicTheme: "Sustainable Growth",
    strategicObjective: "Grow profitably while improving customer value",
    primaryPerspective: "all",
    tags: ["corporate", "strategy", "executive"],
    perspectives: perspectives("AM", {
      financial: [
        { name: "Revenue Growth (YoY)", status: "on-track", score: 95, actual: "38%", target: "40%", variance: "-2%", trend: [31, 33, 35, 36, 37, 38] },
        { name: "Gross Margin", status: "on-track", score: 88, actual: "68%", target: "70%", variance: "-2%", trend: [62, 64, 65, 66, 67, 68] },
      ],
      customer: [
        { name: "Net Promoter Score", status: "on-track", score: 90, actual: "81", target: "78", variance: "+3", trend: [70, 73, 75, 77, 79, 81] },
        { name: "Customer Retention Rate", status: "on-track", score: 86, actual: "94%", target: "92%", variance: "+2%", trend: [89, 90, 91, 92, 93, 94] },
      ],
      "internal-process": [
        { name: "Process Cycle Time", status: "at-risk", score: 63, actual: "5.8 days", target: "5.0 days", variance: "+0.8 days", trend: [6.8, 6.5, 6.3, 6.1, 5.9, 5.8] },
        { name: "Quality Index", status: "on-track", score: 91, actual: "91%", target: "88%", variance: "+3%", trend: [84, 86, 87, 89, 90, 91] },
      ],
      "learning-growth": [
        { name: "Employee Engagement", status: "on-track", score: 88, actual: "88%", target: "82%", variance: "+6%", trend: [79, 81, 83, 85, 86, 88] },
      ],
    }),
  },
  {
    slug: "sales",
    name: "Sales Performance Scorecard",
    department: "Sales",
    period: "Q3 2026",
    ownerName: "Jamie Park",
    ownerInitials: "JP",
    status: "on-track",
    score: 76,
    description: "Tracks pipeline health, conversion, sales efficiency and capability.",
    strategyName: "Commercial Growth Plan 2026",
    strategicTheme: "Revenue Acceleration",
    strategicObjective: "Increase enterprise win rate and recurring revenue",
    primaryPerspective: "financial",
    tags: ["sales", "pipeline", "growth"],
    perspectives: perspectives("JP", {
      financial: [
        { name: "Pipeline Coverage Ratio", status: "on-track", score: 84, actual: "3.4x", target: "3.0x", variance: "+0.4x", trend: [2.7, 2.9, 3.0, 3.1, 3.3, 3.4] },
        { name: "Enterprise Win Rate", status: "at-risk", score: 68, actual: "31%", target: "35%", variance: "-4%", trend: [36, 35, 34, 33, 32, 31] },
      ],
      customer: [
        { name: "Sales Qualified Lead Conversion", status: "on-track", score: 79, actual: "24%", target: "22%", variance: "+2%", trend: [18, 19, 20, 21, 23, 24] },
      ],
      "internal-process": [
        { name: "Deal Cycle Time", status: "on-track", score: 82, actual: "42 days", target: "45 days", variance: "-3 days", trend: [49, 47, 46, 45, 44, 42] },
      ],
      "learning-growth": [
        { name: "Sales Certification Rate", status: "on-track", score: 86, actual: "86%", target: "80%", variance: "+6%", trend: [72, 75, 78, 81, 83, 86] },
      ],
    }),
  },
  {
    slug: "marketing",
    name: "Marketing Scorecard",
    department: "Marketing",
    period: "Q3 2026",
    ownerName: "Priya Nair",
    ownerInitials: "PN",
    status: "at-risk",
    score: 64,
    description: "Measures marketing efficiency, demand generation, brand and team capability.",
    strategyName: "Commercial Growth Plan 2026",
    strategicTheme: "Market Expansion",
    strategicObjective: "Improve qualified demand and brand reach",
    primaryPerspective: "customer",
    tags: ["marketing", "demand", "brand"],
    perspectives: perspectives("PN", {
      financial: [
        { name: "Marketing ROI", status: "at-risk", score: 58, actual: "2.1x", target: "3.0x", variance: "-0.9x", trend: [3.0, 2.8, 2.6, 2.4, 2.2, 2.1] },
      ],
      customer: [
        { name: "Brand Awareness Index", status: "on-track", score: 81, actual: "64%", target: "60%", variance: "+4%", trend: [52, 55, 58, 60, 62, 64] },
        { name: "Lead Conversion Rate", status: "at-risk", score: 54, actual: "9%", target: "14%", variance: "-5%", trend: [14, 13, 12, 11, 10, 9] },
      ],
      "internal-process": [
        { name: "Campaign Launch Cycle Time", status: "at-risk", score: 61, actual: "18 days", target: "14 days", variance: "+4 days", trend: [13, 14, 15, 16, 17, 18] },
      ],
      "learning-growth": [
        { name: "Team Skills Coverage", status: "on-track", score: 79, actual: "79%", target: "75%", variance: "+4%", trend: [68, 70, 72, 74, 77, 79] },
      ],
    }),
  },
  {
    slug: "operations",
    name: "Operations Excellence Scorecard",
    department: "Operations",
    period: "Q3 2026",
    ownerName: "Tom Reilly",
    ownerInitials: "TR",
    status: "draft",
    score: 0,
    description: "Operational reliability, cost, quality and workforce readiness.",
    strategyName: "Operational Excellence 2026",
    strategicTheme: "Reliable Delivery",
    strategicObjective: "Improve service reliability and reduce cost to serve",
    primaryPerspective: "internal-process",
    tags: ["operations", "quality", "efficiency"],
    perspectives: perspectives("TR", {
      "internal-process": [
        { name: "Supply Chain Reliability", status: "draft", score: 0, actual: "—", target: "95%", variance: "—", trend: [] },
      ],
    }),
  },
  {
    slug: "technology",
    name: "Digital Transformation Scorecard",
    department: "Technology",
    period: "Q4 2026",
    ownerName: "Daniel Carter",
    ownerInitials: "DC",
    status: "at-risk",
    score: 71,
    description: "Tracks digital adoption, platform reliability, automation and technology capability.",
    strategyName: "Enterprise Digital Transformation 2025–2027",
    strategicTheme: "Digital Excellence",
    strategicObjective: "Increase digital adoption and operational efficiency",
    primaryPerspective: "internal-process",
    tags: ["digital", "transformation", "technology", "efficiency"],
    perspectives: perspectives("DC", {
      financial: [
        { name: "Technology Cost Efficiency", status: "on-track", score: 82, actual: "-8%", target: "-6%", variance: "-2%", trend: [-2, -3, -4, -5, -7, -8] },
      ],
      customer: [
        { name: "Digital Adoption Rate", status: "at-risk", score: 68, actual: "74%", target: "82%", variance: "-8%", trend: [61, 64, 67, 70, 72, 74] },
      ],
      "internal-process": [
        { name: "Platform Availability", status: "on-track", score: 96, actual: "99.95%", target: "99.9%", variance: "+0.05%", trend: [99.8, 99.85, 99.9, 99.92, 99.93, 99.95] },
        { name: "Automation Coverage", status: "at-risk", score: 63, actual: "58%", target: "70%", variance: "-12%", trend: [42, 45, 49, 52, 55, 58] },
      ],
      "learning-growth": [
        { name: "Cloud Skills Coverage", status: "on-track", score: 80, actual: "80%", target: "75%", variance: "+5%", trend: [62, 65, 69, 72, 76, 80] },
      ],
    }),
  },
];

function perspectiveName(key: PerspectiveKey): string {
  if (key === "financial") return "Financial";
  if (key === "customer") return "Customer";
  if (key === "internal-process") return "Internal Process";
  return "Learning & Growth";
}

async function main() {
  const existingActivePlan = await prisma.planVersion.findFirst({
    where: { status: "ACTIVE" },
  });

  const planVersionId = existingActivePlan?.id ?? (
    await prisma.planVersion.upsert({
      where: { id: PLAN_ID },
      update: { name: "Balanced Scorecard Demo Plan", status: "ACTIVE" },
      create: { id: PLAN_ID, name: "Balanced Scorecard Demo Plan", status: "ACTIVE" },
    })
  ).id;

  for (const card of cards) {
    const scorecardId = stableUuid(`scorecard:${card.slug}`);
    await prisma.$executeRaw`
      INSERT INTO scorecard.scorecards (id, name_en, name_ar, plan_version_id)
      VALUES (${scorecardId}::uuid, ${card.name}, ${card.name}, ${planVersionId}::uuid)
      ON CONFLICT (id) DO UPDATE SET name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar, plan_version_id = EXCLUDED.plan_version_id`;

    await prisma.$executeRaw`
      INSERT INTO scorecard.balanced_scorecard_profiles (
        scorecard_id, description, department, period, owner_name, owner_initials,
        status, score, review_frequency, start_period, end_period, strategy_name,
        strategic_theme, strategic_objective, primary_perspective, strategic_weight, tags, notes
      ) VALUES (
        ${scorecardId}::uuid, ${card.description}, ${card.department}, ${card.period}, ${card.ownerName}, ${card.ownerInitials},
        ${card.status}, ${card.score}, 'Monthly', 'Jan 2026', 'Dec 2026', ${card.strategyName},
        ${card.strategicTheme}, ${card.strategicObjective}, ${card.primaryPerspective}, 25, ${card.tags}::text[], 'Seeded Balanced Scorecard test data'
      )
      ON CONFLICT (scorecard_id) DO UPDATE SET
        description = EXCLUDED.description, department = EXCLUDED.department, period = EXCLUDED.period,
        owner_name = EXCLUDED.owner_name, owner_initials = EXCLUDED.owner_initials,
        status = EXCLUDED.status, score = EXCLUDED.score, review_frequency = EXCLUDED.review_frequency,
        start_period = EXCLUDED.start_period, end_period = EXCLUDED.end_period,
        strategy_name = EXCLUDED.strategy_name, strategic_theme = EXCLUDED.strategic_theme,
        strategic_objective = EXCLUDED.strategic_objective, primary_perspective = EXCLUDED.primary_perspective,
        strategic_weight = EXCLUDED.strategic_weight, tags = EXCLUDED.tags, notes = EXCLUDED.notes,
        updated_at = CURRENT_TIMESTAMP`;

    for (const [order, perspective] of card.perspectives.entries()) {
      const perspectiveId = stableUuid(`perspective:${card.slug}:${perspective.key}`);
      const name = perspectiveName(perspective.key);
      await prisma.$executeRaw`
        INSERT INTO scorecard.perspectives (id, scorecard_id, name_en, name_ar, "order")
        VALUES (${perspectiveId}::uuid, ${scorecardId}::uuid, ${name}, ${name}, ${order})
        ON CONFLICT (id) DO UPDATE SET name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar, "order" = EXCLUDED."order"`;

      await prisma.$executeRaw`
        INSERT INTO scorecard.balanced_perspective_profiles (
          perspective_id, perspective_key, owner_initials, owner_color, score, weight
        ) VALUES (
          ${perspectiveId}::uuid, ${perspective.key}, ${perspective.ownerInitials}, ${perspective.ownerColor}, ${perspective.score}, ${perspective.weight}
        )
        ON CONFLICT (perspective_id) DO UPDATE SET
          perspective_key = EXCLUDED.perspective_key, owner_initials = EXCLUDED.owner_initials,
          owner_color = EXCLUDED.owner_color, score = EXCLUDED.score, weight = EXCLUDED.weight,
          updated_at = CURRENT_TIMESTAMP`;

      for (const [index, kpi] of perspective.kpis.entries()) {
        const kpiId = stableUuid(`kpi:${card.slug}:${perspective.key}:${index}:${kpi.name}`);
        await prisma.$executeRaw`
          INSERT INTO scorecard.kpi_snapshots (
            id, perspective_id, name, status, owner_initials, owner_color,
            score, weight, actual, target, variance, trend
          ) VALUES (
            ${kpiId}::uuid, ${perspectiveId}::uuid, ${kpi.name}, ${kpi.status}, ${perspective.ownerInitials}, ${perspective.ownerColor},
            ${kpi.score}, 100, ${kpi.actual}, ${kpi.target}, ${kpi.variance}, ${JSON.stringify(kpi.trend)}::jsonb
          )
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name, status = EXCLUDED.status, owner_initials = EXCLUDED.owner_initials,
            owner_color = EXCLUDED.owner_color, score = EXCLUDED.score, weight = EXCLUDED.weight,
            actual = EXCLUDED.actual, target = EXCLUDED.target, variance = EXCLUDED.variance,
            trend = EXCLUDED.trend, updated_at = CURRENT_TIMESTAMP`;
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