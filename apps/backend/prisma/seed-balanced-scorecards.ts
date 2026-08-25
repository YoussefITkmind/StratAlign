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
type ScorecardStatus = "on-track" | "at-risk" | "draft";
type ObjectiveStatus = "on-track" | "at-risk" | "off-track" | "not-started";
type PerspectiveKey = "financial" | "customer" | "internal-process" | "learning-growth";
type LinkStrength = "enables" | "impacts" | "drives" | "supports";

type SeedKpi = {
  name: string;
  status: ScorecardStatus;
  score: number;
  actual: string;
  target: string;
  variance: string;
  trend: number[];
};

type SeedPerspective = {
  key: PerspectiveKey;
  weight: number;
  ownerInitials: string;
  ownerColor: string;
  kpis: SeedKpi[];
};

type SeedObjective = {
  slug: string;
  perspective: PerspectiveKey;
  name: string;
  status: ObjectiveStatus;
  progress: number;
  ownerName: string;
  description: string;
  kpis: string[];
};

type SeedLink = {
  from: string;
  to: string;
  strength: LinkStrength;
};

type SeedCard = {
  slug: string;
  name: string;
  department: string;
  period: string;
  ownerName: string;
  ownerInitials: string;
  status: ScorecardStatus;
  score: number;
  description: string;
  strategyName: string;
  strategicTheme: string;
  strategicObjective: string;
  primaryPerspective: PerspectiveKey | "all";
  tags: string[];
  perspectives: SeedPerspective[];
  objectives: SeedObjective[];
  links: SeedLink[];
};

const ownerColor = {
  financial: "bg-indigo-500",
  customer: "bg-blue-500",
  "internal-process": "bg-emerald-500",
  "learning-growth": "bg-amber-500",
} satisfies Record<PerspectiveKey, string>;

const perspectiveWeights: Record<PerspectiveKey, number> = {
  financial: 30,
  customer: 25,
  "internal-process": 30,
  "learning-growth": 15,
};

function p(key: PerspectiveKey, initials: string, kpis: SeedKpi[]): SeedPerspective {
  return { key, weight: perspectiveWeights[key], ownerInitials: initials, ownerColor: ownerColor[key], kpis };
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
    description: "Executive view of enterprise growth, customer value, operating excellence and organizational capability.",
    strategyName: "Enterprise Strategy 2026–2028",
    strategicTheme: "Sustainable Profitable Growth",
    strategicObjective: "Grow profitably while improving customer value",
    primaryPerspective: "all",
    tags: ["corporate", "strategy", "executive", "growth"],
    perspectives: [
      p("financial", "AM", [
        { name: "Revenue Growth (YoY)", status: "on-track", score: 95, actual: "38%", target: "40%", variance: "-2%", trend: [31, 33, 35, 36, 37, 38] },
        { name: "Gross Margin", status: "on-track", score: 88, actual: "68%", target: "70%", variance: "-2%", trend: [62, 64, 65, 66, 67, 68] },
        { name: "Cost-to-Serve Ratio", status: "at-risk", score: 65, actual: "18.4%", target: "16.5%", variance: "+1.9%", trend: [20.2, 19.8, 19.4, 19.1, 18.8, 18.4] },
      ]),
      p("customer", "PN", [
        { name: "Net Promoter Score", status: "on-track", score: 90, actual: "81", target: "78", variance: "+3", trend: [70, 73, 75, 77, 79, 81] },
        { name: "Customer Retention Rate", status: "on-track", score: 86, actual: "94%", target: "92%", variance: "+2%", trend: [89, 90, 91, 92, 93, 94] },
        { name: "EMEA Enterprise Accounts", status: "at-risk", score: 72, actual: "43", target: "50", variance: "-7", trend: [28, 31, 34, 37, 40, 43] },
      ]),
      p("internal-process", "SW", [
        { name: "Process Cycle Time", status: "on-track", score: 74, actual: "5.3 days", target: "5.0 days", variance: "+0.3 days", trend: [6.8, 6.4, 6.0, 5.7, 5.5, 5.3] },
        { name: "Quality Index", status: "on-track", score: 91, actual: "91%", target: "88%", variance: "+3%", trend: [84, 86, 87, 89, 90, 91] },
        { name: "Automation Coverage", status: "at-risk", score: 71, actual: "63%", target: "70%", variance: "-7%", trend: [45, 49, 53, 56, 60, 63] },
      ]),
      p("learning-growth", "NT", [
        { name: "Employee Engagement", status: "on-track", score: 88, actual: "88%", target: "82%", variance: "+6%", trend: [79, 81, 83, 85, 86, 88] },
        { name: "Strategic Skills Coverage", status: "at-risk", score: 76, actual: "76%", target: "85%", variance: "-9%", trend: [60, 64, 67, 70, 73, 76] },
      ]),
    ],
    objectives: [
      { slug: "grow-revenue", perspective: "financial", name: "Grow Revenue 20% YoY", status: "on-track", progress: 78, ownerName: "Alex Morgan", description: "Accelerate recurring and enterprise revenue while protecting quality of growth.", kpis: ["Revenue Growth (YoY)"] },
      { slug: "operating-margin", perspective: "financial", name: "Improve Operating Margin", status: "at-risk", progress: 64, ownerName: "Jamie Park", description: "Expand margin through pricing discipline, mix improvement and operating leverage.", kpis: ["Gross Margin"] },
      { slug: "cost-to-serve", perspective: "financial", name: "Reduce Cost to Serve", status: "at-risk", progress: 65, ownerName: "Alex Morgan", description: "Lower the structural cost of serving customers through simplification and automation.", kpis: ["Cost-to-Serve Ratio"] },
      { slug: "raise-csat", perspective: "customer", name: "Raise Customer Advocacy", status: "on-track", progress: 82, ownerName: "Priya Nair", description: "Create consistently differentiated experiences that increase advocacy and recommendation.", kpis: ["Net Promoter Score"] },
      { slug: "reduce-churn", perspective: "customer", name: "Reduce Customer Churn", status: "at-risk", progress: 58, ownerName: "Priya Nair", description: "Improve retention through proactive success management and early-risk intervention.", kpis: ["Customer Retention Rate"] },
      { slug: "expand-emea", perspective: "customer", name: "Expand into EMEA", status: "at-risk", progress: 40, ownerName: "Diego Ramirez", description: "Build enterprise market presence in priority EMEA segments and strategic accounts.", kpis: ["EMEA Enterprise Accounts"] },
      { slug: "automate-workflows", perspective: "internal-process", name: "Automate Core Workflows", status: "on-track", progress: 71, ownerName: "Sam Whitfield", description: "Automate high-volume operational workflows to improve speed, consistency and cost efficiency.", kpis: ["Automation Coverage", "Process Cycle Time"] },
      { slug: "delivery-quality", perspective: "internal-process", name: "Improve Delivery Quality", status: "on-track", progress: 86, ownerName: "Sam Whitfield", description: "Strengthen quality controls and execution discipline across critical delivery processes.", kpis: ["Quality Index"] },
      { slug: "upskill-team", perspective: "learning-growth", name: "Upskill Engineering Team", status: "at-risk", progress: 55, ownerName: "Nina Torres", description: "Build strategic digital, data and automation capabilities across the engineering organization.", kpis: ["Strategic Skills Coverage"] },
      { slug: "engagement", perspective: "learning-growth", name: "Boost Employee Engagement", status: "on-track", progress: 73, ownerName: "Nina Torres", description: "Strengthen leadership, recognition and team connection to improve engagement and performance.", kpis: ["Employee Engagement"] },
    ],
    links: [
      { from: "upskill-team", to: "automate-workflows", strength: "enables" },
      { from: "engagement", to: "delivery-quality", strength: "supports" },
      { from: "automate-workflows", to: "cost-to-serve", strength: "drives" },
      { from: "delivery-quality", to: "raise-csat", strength: "impacts" },
      { from: "raise-csat", to: "reduce-churn", strength: "enables" },
      { from: "reduce-churn", to: "grow-revenue", strength: "drives" },
      { from: "expand-emea", to: "grow-revenue", strength: "impacts" },
      { from: "cost-to-serve", to: "operating-margin", strength: "drives" },
      { from: "grow-revenue", to: "operating-margin", strength: "supports" },
    ],
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
    description: "Commercial performance view covering recurring revenue, pipeline conversion, execution discipline and selling capability.",
    strategyName: "Commercial Growth Plan 2026",
    strategicTheme: "Revenue Acceleration",
    strategicObjective: "Increase enterprise win rate and recurring revenue",
    primaryPerspective: "financial",
    tags: ["sales", "pipeline", "growth", "enterprise"],
    perspectives: [
      p("financial", "JP", [
        { name: "New ARR", status: "on-track", score: 83, actual: "$18.6M", target: "$20M", variance: "-$1.4M", trend: [11.2, 12.8, 14.1, 15.6, 17.2, 18.6] },
        { name: "Enterprise Win Rate", status: "at-risk", score: 68, actual: "31%", target: "35%", variance: "-4%", trend: [36, 35, 34, 33, 32, 31] },
      ]),
      p("customer", "JP", [
        { name: "Qualified Pipeline Conversion", status: "on-track", score: 79, actual: "24%", target: "22%", variance: "+2%", trend: [18, 19, 20, 21, 23, 24] },
        { name: "Strategic Account Retention", status: "on-track", score: 87, actual: "96%", target: "94%", variance: "+2%", trend: [91, 92, 93, 94, 95, 96] },
      ]),
      p("internal-process", "JP", [
        { name: "Deal Cycle Time", status: "on-track", score: 82, actual: "42 days", target: "45 days", variance: "-3 days", trend: [49, 47, 46, 45, 44, 42] },
        { name: "Forecast Accuracy", status: "at-risk", score: 69, actual: "84%", target: "90%", variance: "-6%", trend: [78, 80, 82, 81, 83, 84] },
      ]),
      p("learning-growth", "JP", [
        { name: "Sales Certification Rate", status: "on-track", score: 86, actual: "86%", target: "80%", variance: "+6%", trend: [72, 75, 78, 81, 83, 86] },
        { name: "Coaching Coverage", status: "on-track", score: 81, actual: "89%", target: "85%", variance: "+4%", trend: [76, 79, 82, 84, 87, 89] },
      ]),
    ],
    objectives: [
      { slug: "new-arr", perspective: "financial", name: "Grow New ARR", status: "on-track", progress: 83, ownerName: "Jamie Park", description: "Accelerate high-quality annual recurring revenue from enterprise and strategic accounts.", kpis: ["New ARR"] },
      { slug: "win-rate", perspective: "financial", name: "Improve Enterprise Win Rate", status: "at-risk", progress: 68, ownerName: "Jamie Park", description: "Increase conversion of qualified enterprise opportunities through value-led selling.", kpis: ["Enterprise Win Rate"] },
      { slug: "strategic-accounts", perspective: "customer", name: "Expand Strategic Accounts", status: "on-track", progress: 87, ownerName: "Lena Ortiz", description: "Deepen executive relationships and protect recurring value in strategic accounts.", kpis: ["Strategic Account Retention"] },
      { slug: "pipeline", perspective: "customer", name: "Increase Qualified Pipeline", status: "on-track", progress: 79, ownerName: "Lena Ortiz", description: "Improve qualification discipline and create a healthier enterprise opportunity mix.", kpis: ["Qualified Pipeline Conversion"] },
      { slug: "cycle", perspective: "internal-process", name: "Shorten Deal Cycle", status: "on-track", progress: 82, ownerName: "Marcus Lee", description: "Reduce friction across discovery, solutioning, commercial approvals and contracting.", kpis: ["Deal Cycle Time"] },
      { slug: "forecast", perspective: "internal-process", name: "Improve Forecast Accuracy", status: "at-risk", progress: 69, ownerName: "Marcus Lee", description: "Strengthen pipeline inspection and opportunity hygiene to improve forecast confidence.", kpis: ["Forecast Accuracy"] },
      { slug: "consultative", perspective: "learning-growth", name: "Build Consultative Selling Skills", status: "on-track", progress: 86, ownerName: "Rosa Chen", description: "Equip sellers to lead outcome-based conversations with senior enterprise buyers.", kpis: ["Sales Certification Rate"] },
      { slug: "coaching", perspective: "learning-growth", name: "Strengthen Coaching Cadence", status: "on-track", progress: 81, ownerName: "Rosa Chen", description: "Create a consistent manager coaching rhythm focused on deal quality and capability growth.", kpis: ["Coaching Coverage"] },
    ],
    links: [
      { from: "consultative", to: "pipeline", strength: "enables" },
      { from: "coaching", to: "forecast", strength: "supports" },
      { from: "forecast", to: "cycle", strength: "enables" },
      { from: "cycle", to: "win-rate", strength: "impacts" },
      { from: "pipeline", to: "win-rate", strength: "drives" },
      { from: "strategic-accounts", to: "new-arr", strength: "supports" },
      { from: "win-rate", to: "new-arr", strength: "drives" },
    ],
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
    description: "Measures demand efficiency, market presence, campaign execution and modern marketing capability.",
    strategyName: "Commercial Growth Plan 2026",
    strategicTheme: "Market Expansion",
    strategicObjective: "Improve qualified demand and brand reach",
    primaryPerspective: "customer",
    tags: ["marketing", "demand", "brand", "growth"],
    perspectives: [
      p("financial", "PN", [
        { name: "Marketing ROI", status: "at-risk", score: 58, actual: "2.1x", target: "3.0x", variance: "-0.9x", trend: [3.0, 2.8, 2.6, 2.4, 2.2, 2.1] },
        { name: "Customer Acquisition Cost", status: "at-risk", score: 62, actual: "$5,240", target: "$4,600", variance: "+$640", trend: [4700, 4800, 4920, 5050, 5160, 5240] },
      ]),
      p("customer", "PN", [
        { name: "Brand Awareness Index", status: "on-track", score: 81, actual: "64%", target: "60%", variance: "+4%", trend: [52, 55, 58, 60, 62, 64] },
        { name: "Lead Conversion Rate", status: "at-risk", score: 54, actual: "9%", target: "14%", variance: "-5%", trend: [14, 13, 12, 11, 10, 9] },
      ]),
      p("internal-process", "PN", [
        { name: "Campaign Launch Cycle Time", status: "at-risk", score: 61, actual: "18 days", target: "14 days", variance: "+4 days", trend: [13, 14, 15, 16, 17, 18] },
        { name: "MQL-to-SQL Handoff SLA", status: "on-track", score: 84, actual: "91%", target: "88%", variance: "+3%", trend: [80, 83, 85, 87, 89, 91] },
      ]),
      p("learning-growth", "PN", [
        { name: "Team Skills Coverage", status: "on-track", score: 79, actual: "79%", target: "75%", variance: "+4%", trend: [68, 70, 72, 74, 77, 79] },
        { name: "Experiment Velocity", status: "on-track", score: 77, actual: "12 / qtr", target: "10 / qtr", variance: "+2", trend: [6, 7, 8, 9, 10, 12] },
      ]),
    ],
    objectives: [
      { slug: "marketing-roi", perspective: "financial", name: "Improve Marketing ROI", status: "at-risk", progress: 58, ownerName: "Priya Nair", description: "Improve return on marketing investment through sharper allocation and performance optimization.", kpis: ["Marketing ROI"] },
      { slug: "cac", perspective: "financial", name: "Reduce Acquisition Cost", status: "at-risk", progress: 62, ownerName: "Priya Nair", description: "Reduce customer acquisition cost by improving targeting, conversion and channel efficiency.", kpis: ["Customer Acquisition Cost"] },
      { slug: "brand", perspective: "customer", name: "Strengthen Brand Presence", status: "on-track", progress: 81, ownerName: "Maya Singh", description: "Increase awareness and consideration in priority enterprise segments.", kpis: ["Brand Awareness Index"] },
      { slug: "conversion", perspective: "customer", name: "Increase Qualified Demand", status: "at-risk", progress: 54, ownerName: "Maya Singh", description: "Increase the proportion of engaged demand that converts into qualified sales opportunities.", kpis: ["Lead Conversion Rate"] },
      { slug: "campaign-speed", perspective: "internal-process", name: "Accelerate Campaign Delivery", status: "at-risk", progress: 61, ownerName: "Oliver Grant", description: "Reduce time from campaign concept to launch while preserving quality and governance.", kpis: ["Campaign Launch Cycle Time"] },
      { slug: "handoff", perspective: "internal-process", name: "Improve Revenue Handoff", status: "on-track", progress: 84, ownerName: "Oliver Grant", description: "Create a fast, reliable marketing-to-sales handoff for high-intent demand.", kpis: ["MQL-to-SQL Handoff SLA"] },
      { slug: "skills", perspective: "learning-growth", name: "Build Modern Marketing Skills", status: "on-track", progress: 79, ownerName: "Ana Costa", description: "Develop analytics, experimentation, digital and AI-enabled marketing capability.", kpis: ["Team Skills Coverage"] },
      { slug: "experimentation", perspective: "learning-growth", name: "Scale Experimentation", status: "on-track", progress: 77, ownerName: "Ana Costa", description: "Increase disciplined experimentation across campaigns, channels and customer journeys.", kpis: ["Experiment Velocity"] },
    ],
    links: [
      { from: "skills", to: "experimentation", strength: "enables" },
      { from: "experimentation", to: "campaign-speed", strength: "drives" },
      { from: "campaign-speed", to: "brand", strength: "impacts" },
      { from: "handoff", to: "conversion", strength: "enables" },
      { from: "brand", to: "conversion", strength: "supports" },
      { from: "conversion", to: "cac", strength: "drives" },
      { from: "cac", to: "marketing-roi", strength: "impacts" },
    ],
  },
  {
    slug: "operations",
    name: "Operations Excellence Scorecard",
    department: "Operations",
    period: "Q3 2026",
    ownerName: "Tom Reilly",
    ownerInitials: "TR",
    status: "draft",
    score: 72,
    description: "Operational performance view covering service economics, reliability, quality, throughput and workforce readiness.",
    strategyName: "Operational Excellence 2026",
    strategicTheme: "Reliable Efficient Delivery",
    strategicObjective: "Improve service reliability and reduce cost to serve",
    primaryPerspective: "internal-process",
    tags: ["operations", "quality", "efficiency", "delivery"],
    perspectives: [
      p("financial", "TR", [
        { name: "Cost per Transaction", status: "at-risk", score: 68, actual: "$7.40", target: "$6.80", variance: "+$0.60", trend: [8.4, 8.1, 7.9, 7.7, 7.5, 7.4] },
        { name: "Procurement Savings", status: "on-track", score: 79, actual: "$4.8M", target: "$4.5M", variance: "+$0.3M", trend: [2.1, 2.8, 3.3, 3.8, 4.3, 4.8] },
      ]),
      p("customer", "TR", [
        { name: "On-Time Delivery", status: "on-track", score: 88, actual: "96%", target: "95%", variance: "+1%", trend: [91, 92, 93, 94, 95, 96] },
        { name: "Service SLA Attainment", status: "at-risk", score: 73, actual: "92%", target: "95%", variance: "-3%", trend: [89, 90, 91, 91, 92, 92] },
      ]),
      p("internal-process", "TR", [
        { name: "First Pass Yield", status: "on-track", score: 86, actual: "97.2%", target: "96%", variance: "+1.2%", trend: [94.8, 95.3, 95.9, 96.2, 96.8, 97.2] },
        { name: "End-to-End Cycle Time", status: "at-risk", score: 66, actual: "3.8 days", target: "3.0 days", variance: "+0.8 days", trend: [4.7, 4.5, 4.3, 4.1, 3.9, 3.8] },
      ]),
      p("learning-growth", "TR", [
        { name: "Lean Certification", status: "on-track", score: 82, actual: "82%", target: "75%", variance: "+7%", trend: [62, 66, 70, 74, 78, 82] },
        { name: "Cross-Training Coverage", status: "at-risk", score: 69, actual: "69%", target: "80%", variance: "-11%", trend: [54, 57, 60, 63, 66, 69] },
      ]),
    ],
    objectives: [
      { slug: "transaction-cost", perspective: "financial", name: "Reduce Transaction Cost", status: "at-risk", progress: 68, ownerName: "Tom Reilly", description: "Reduce unit operating cost through simplification, scale and waste elimination.", kpis: ["Cost per Transaction"] },
      { slug: "savings", perspective: "financial", name: "Capture Procurement Savings", status: "on-track", progress: 79, ownerName: "Tom Reilly", description: "Deliver sustainable sourcing and supplier value through category discipline.", kpis: ["Procurement Savings"] },
      { slug: "delivery", perspective: "customer", name: "Improve On-Time Delivery", status: "on-track", progress: 88, ownerName: "Grace Liu", description: "Increase delivery reliability and predictability for internal and external customers.", kpis: ["On-Time Delivery"] },
      { slug: "sla", perspective: "customer", name: "Strengthen Service Reliability", status: "at-risk", progress: 73, ownerName: "Grace Liu", description: "Improve consistent achievement of customer-facing service commitments.", kpis: ["Service SLA Attainment"] },
      { slug: "yield", perspective: "internal-process", name: "Increase First-Pass Quality", status: "on-track", progress: 86, ownerName: "Ethan Brooks", description: "Reduce rework and defects by improving process capability and control.", kpis: ["First Pass Yield"] },
      { slug: "cycle", perspective: "internal-process", name: "Shorten End-to-End Cycle Time", status: "at-risk", progress: 66, ownerName: "Ethan Brooks", description: "Remove bottlenecks and waiting time across end-to-end operational flows.", kpis: ["End-to-End Cycle Time"] },
      { slug: "lean", perspective: "learning-growth", name: "Scale Lean Capability", status: "on-track", progress: 82, ownerName: "Sofia Mendes", description: "Build practical lean problem-solving capability across operations teams.", kpis: ["Lean Certification"] },
      { slug: "cross-train", perspective: "learning-growth", name: "Increase Workforce Flexibility", status: "at-risk", progress: 69, ownerName: "Sofia Mendes", description: "Increase cross-training to improve resilience, capacity flexibility and continuity.", kpis: ["Cross-Training Coverage"] },
    ],
    links: [
      { from: "lean", to: "yield", strength: "enables" },
      { from: "cross-train", to: "cycle", strength: "supports" },
      { from: "yield", to: "delivery", strength: "impacts" },
      { from: "cycle", to: "sla", strength: "drives" },
      { from: "delivery", to: "savings", strength: "supports" },
      { from: "cycle", to: "transaction-cost", strength: "drives" },
      { from: "savings", to: "transaction-cost", strength: "impacts" },
    ],
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
    description: "Tracks digital adoption, platform economics, automation, reliability and technology capability.",
    strategyName: "Enterprise Digital Transformation 2025–2027",
    strategicTheme: "Digital Excellence",
    strategicObjective: "Increase digital adoption and operational efficiency",
    primaryPerspective: "internal-process",
    tags: ["digital", "transformation", "technology", "efficiency"],
    perspectives: [
      p("financial", "DC", [
        { name: "Technology Cost Efficiency", status: "on-track", score: 82, actual: "-8%", target: "-6%", variance: "-2%", trend: [-2, -3, -4, -5, -7, -8] },
        { name: "Cloud Unit Cost", status: "at-risk", score: 70, actual: "$0.084", target: "$0.075", variance: "+$0.009", trend: [0.102, 0.098, 0.094, 0.09, 0.087, 0.084] },
      ]),
      p("customer", "DC", [
        { name: "Digital Adoption Rate", status: "at-risk", score: 68, actual: "74%", target: "82%", variance: "-8%", trend: [61, 64, 67, 70, 72, 74] },
        { name: "Digital Experience CSAT", status: "on-track", score: 83, actual: "4.4 / 5", target: "4.2 / 5", variance: "+0.2", trend: [3.9, 4.0, 4.1, 4.2, 4.3, 4.4] },
      ]),
      p("internal-process", "DC", [
        { name: "Platform Availability", status: "on-track", score: 96, actual: "99.95%", target: "99.9%", variance: "+0.05%", trend: [99.8, 99.85, 99.9, 99.92, 99.93, 99.95] },
        { name: "Automation Coverage", status: "at-risk", score: 63, actual: "58%", target: "70%", variance: "-12%", trend: [42, 45, 49, 52, 55, 58] },
      ]),
      p("learning-growth", "DC", [
        { name: "Cloud Skills Coverage", status: "on-track", score: 80, actual: "80%", target: "75%", variance: "+5%", trend: [62, 65, 69, 72, 76, 80] },
        { name: "Developer Experience Index", status: "at-risk", score: 72, actual: "72", target: "80", variance: "-8", trend: [60, 63, 66, 68, 70, 72] },
      ]),
    ],
    objectives: [
      { slug: "tech-cost", perspective: "financial", name: "Improve Technology Economics", status: "on-track", progress: 82, ownerName: "Daniel Carter", description: "Deliver measurable technology productivity while protecting strategic investment capacity.", kpis: ["Technology Cost Efficiency"] },
      { slug: "cloud-cost", perspective: "financial", name: "Optimize Cloud Unit Cost", status: "at-risk", progress: 70, ownerName: "Daniel Carter", description: "Improve cloud economics through architecture, capacity and FinOps discipline.", kpis: ["Cloud Unit Cost"] },
      { slug: "adoption", perspective: "customer", name: "Increase Digital Adoption", status: "at-risk", progress: 68, ownerName: "Megan Cole", description: "Increase adoption of strategic digital journeys and self-service capabilities.", kpis: ["Digital Adoption Rate"] },
      { slug: "digital-csat", perspective: "customer", name: "Improve Digital Experience", status: "on-track", progress: 83, ownerName: "Megan Cole", description: "Create simple, reliable and intuitive digital experiences across priority journeys.", kpis: ["Digital Experience CSAT"] },
      { slug: "availability", perspective: "internal-process", name: "Strengthen Platform Reliability", status: "on-track", progress: 96, ownerName: "Leo Bennett", description: "Maintain resilient platforms with strong availability and operational observability.", kpis: ["Platform Availability"] },
      { slug: "automation", perspective: "internal-process", name: "Scale Intelligent Automation", status: "at-risk", progress: 63, ownerName: "Leo Bennett", description: "Expand automation across software delivery, operations and business workflows.", kpis: ["Automation Coverage"] },
      { slug: "cloud-skills", perspective: "learning-growth", name: "Build Cloud & AI Capability", status: "on-track", progress: 80, ownerName: "Chloe Martin", description: "Build deep cloud, platform, data and AI capability across technology teams.", kpis: ["Cloud Skills Coverage"] },
      { slug: "devex", perspective: "learning-growth", name: "Improve Developer Experience", status: "at-risk", progress: 72, ownerName: "Chloe Martin", description: "Reduce engineering friction with better platforms, tooling, standards and feedback loops.", kpis: ["Developer Experience Index"] },
    ],
    links: [
      { from: "cloud-skills", to: "automation", strength: "enables" },
      { from: "devex", to: "availability", strength: "supports" },
      { from: "automation", to: "cloud-cost", strength: "drives" },
      { from: "availability", to: "digital-csat", strength: "impacts" },
      { from: "digital-csat", to: "adoption", strength: "supports" },
      { from: "adoption", to: "tech-cost", strength: "impacts" },
      { from: "cloud-cost", to: "tech-cost", strength: "drives" },
    ],
  },
  {
    slug: "customer-experience",
    name: "Customer Experience Scorecard",
    department: "Customer Experience",
    period: "Q3 2026",
    ownerName: "Sofia Bennett",
    ownerInitials: "SB",
    status: "on-track",
    score: 84,
    description: "Customer experience view spanning loyalty economics, advocacy, service performance and frontline capability.",
    strategyName: "Customer Value Strategy 2026",
    strategicTheme: "Trusted Effortless Experiences",
    strategicObjective: "Increase loyalty by making every priority customer journey simple, proactive and valuable",
    primaryPerspective: "customer",
    tags: ["customer", "experience", "retention", "service"],
    perspectives: [
      p("financial", "SB", [
        { name: "Customer Lifetime Value", status: "on-track", score: 87, actual: "$148K", target: "$140K", variance: "+$8K", trend: [126, 131, 135, 139, 144, 148] },
        { name: "Service Cost per Customer", status: "at-risk", score: 72, actual: "$412", target: "$380", variance: "+$32", trend: [455, 448, 438, 429, 420, 412] },
      ]),
      p("customer", "SB", [
        { name: "Net Promoter Score", status: "on-track", score: 89, actual: "76", target: "72", variance: "+4", trend: [64, 67, 69, 72, 74, 76] },
        { name: "Customer Retention Rate", status: "on-track", score: 92, actual: "95%", target: "93%", variance: "+2%", trend: [91, 92, 92, 93, 94, 95] },
      ]),
      p("internal-process", "SB", [
        { name: "First Contact Resolution", status: "on-track", score: 85, actual: "86%", target: "82%", variance: "+4%", trend: [75, 78, 80, 82, 84, 86] },
        { name: "Average Response Time", status: "at-risk", score: 74, actual: "3.6 hrs", target: "3.0 hrs", variance: "+0.6 hrs", trend: [5.4, 4.9, 4.5, 4.1, 3.8, 3.6] },
      ]),
      p("learning-growth", "SB", [
        { name: "CX Certification Coverage", status: "on-track", score: 83, actual: "83%", target: "80%", variance: "+3%", trend: [68, 72, 75, 78, 81, 83] },
        { name: "Frontline Engagement", status: "on-track", score: 86, actual: "86%", target: "82%", variance: "+4%", trend: [77, 79, 81, 82, 84, 86] },
      ]),
    ],
    objectives: [
      { slug: "clv", perspective: "financial", name: "Grow Customer Lifetime Value", status: "on-track", progress: 87, ownerName: "Sofia Bennett", description: "Increase lifetime value through stronger loyalty, adoption and expansion across customer relationships.", kpis: ["Customer Lifetime Value"] },
      { slug: "service-cost", perspective: "financial", name: "Reduce Service Cost", status: "at-risk", progress: 72, ownerName: "Sofia Bennett", description: "Reduce avoidable service demand while preserving a premium customer experience.", kpis: ["Service Cost per Customer"] },
      { slug: "advocacy", perspective: "customer", name: "Increase Customer Advocacy", status: "on-track", progress: 89, ownerName: "Ava Williams", description: "Create memorable experiences that increase advocacy, trust and recommendation.", kpis: ["Net Promoter Score"] },
      { slug: "retention", perspective: "customer", name: "Improve Customer Retention", status: "on-track", progress: 92, ownerName: "Ava Williams", description: "Proactively protect valuable relationships and reduce preventable churn.", kpis: ["Customer Retention Rate"] },
      { slug: "fcr", perspective: "internal-process", name: "Resolve Issues First Time", status: "on-track", progress: 85, ownerName: "Noah Kim", description: "Increase first-contact resolution by improving knowledge, routing and frontline authority.", kpis: ["First Contact Resolution"] },
      { slug: "response", perspective: "internal-process", name: "Accelerate Customer Response", status: "at-risk", progress: 74, ownerName: "Noah Kim", description: "Reduce response times across high-priority support and service journeys.", kpis: ["Average Response Time"] },
      { slug: "cx-skills", perspective: "learning-growth", name: "Build CX Capability", status: "on-track", progress: 83, ownerName: "Ella Thompson", description: "Build customer-centric service design, communication and problem-solving capability.", kpis: ["CX Certification Coverage"] },
      { slug: "frontline", perspective: "learning-growth", name: "Empower Frontline Teams", status: "on-track", progress: 86, ownerName: "Ella Thompson", description: "Increase frontline engagement, confidence and decision-making authority.", kpis: ["Frontline Engagement"] },
    ],
    links: [
      { from: "cx-skills", to: "fcr", strength: "enables" },
      { from: "frontline", to: "response", strength: "supports" },
      { from: "fcr", to: "advocacy", strength: "impacts" },
      { from: "response", to: "retention", strength: "drives" },
      { from: "advocacy", to: "retention", strength: "supports" },
      { from: "retention", to: "clv", strength: "drives" },
      { from: "fcr", to: "service-cost", strength: "impacts" },
    ],
  },
];

function perspectiveName(key: PerspectiveKey): string {
  if (key === "financial") return "Financial";
  if (key === "customer") return "Customer";
  if (key === "internal-process") return "Internal Process";
  return "Learning & Growth";
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

async function main() {
  const actorRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM iam.users ORDER BY created_at, id LIMIT 1`;
  const actorUserId = actorRows[0]?.id;
  if (!actorUserId) throw new Error("At least one IAM user is required before seeding scorecard objectives");

  const existingActivePlan = await prisma.planVersion.findFirst({ where: { status: "ACTIVE" } });
  const fallbackPlanVersionId = existingActivePlan?.id ?? (
    await prisma.planVersion.upsert({
      where: { id: PLAN_ID },
      update: { name: "Balanced Scorecard Demo Plan", status: "ACTIVE" },
      create: { id: PLAN_ID, name: "Balanced Scorecard Demo Plan", status: "ACTIVE" },
    })
  ).id;

  let objectiveCount = 0;
  let linkCount = 0;
  let kpiCount = 0;

  for (const card of cards) {
    await prisma.$transaction(async (tx) => {
      const existingRows = await tx.$queryRaw<Array<{ id: string; planVersionId: string }>>`
        SELECT s.id, s.plan_version_id AS "planVersionId"
        FROM scorecard.scorecards s
        LEFT JOIN scorecard.balanced_scorecard_profiles bp ON bp.scorecard_id = s.id
        WHERE s.name_en = ${card.name}
        ORDER BY (bp.scorecard_id IS NOT NULL) DESC, s.id
        LIMIT 1`;

      const scorecardId = existingRows[0]?.id ?? stableUuid(`scorecard:${card.slug}`);
      const planVersionId = existingRows[0]?.planVersionId ?? fallbackPlanVersionId;

      await tx.$executeRaw`
        INSERT INTO scorecard.scorecards (id, name_en, name_ar, plan_version_id)
        VALUES (${scorecardId}::uuid, ${card.name}, ${card.name}, ${planVersionId}::uuid)
        ON CONFLICT (id) DO UPDATE SET name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar`;

      await tx.$executeRaw`
        INSERT INTO scorecard.balanced_scorecard_profiles (
          scorecard_id, description, department, period, owner_name, owner_initials,
          status, score, review_frequency, start_period, end_period, strategy_name,
          strategic_theme, strategic_objective, primary_perspective, strategic_weight, tags, notes
        ) VALUES (
          ${scorecardId}::uuid, ${card.description}, ${card.department}, ${card.period}, ${card.ownerName}, ${card.ownerInitials},
          ${card.status}, ${card.score}, 'Monthly', 'Jan 2026', 'Dec 2026', ${card.strategyName},
          ${card.strategicTheme}, ${card.strategicObjective}, ${card.primaryPerspective}, 25, ${card.tags}::text[], 'Professional connected Balanced Scorecard demo data'
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

      const previousObjectives = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT objective_node_id AS id FROM scorecard.objective_profiles WHERE scorecard_id = ${scorecardId}::uuid`;

      await tx.$executeRaw`
        DELETE FROM scorecard.map_links
        WHERE strategy_map_id IN (SELECT id FROM scorecard.strategy_maps WHERE scorecard_id = ${scorecardId}::uuid)`;
      await tx.$executeRaw`
        DELETE FROM scorecard.objective_kpi_links
        WHERE objective_node_id IN (SELECT objective_node_id FROM scorecard.objective_profiles WHERE scorecard_id = ${scorecardId}::uuid)`;
      await tx.$executeRaw`
        DELETE FROM scorecard.placements WHERE perspective_id IN (SELECT id FROM scorecard.perspectives WHERE scorecard_id = ${scorecardId}::uuid)`;
      await tx.$executeRaw`DELETE FROM scorecard.objective_profiles WHERE scorecard_id = ${scorecardId}::uuid`;
      await tx.$executeRaw`
        DELETE FROM scorecard.kpi_snapshots WHERE perspective_id IN (SELECT id FROM scorecard.perspectives WHERE scorecard_id = ${scorecardId}::uuid)`;

      for (const previous of previousObjectives) {
        await tx.$executeRaw`
          UPDATE strategy.strategy_nodes
          SET state = 'retired'::strategy."StrategyNodeState"
          WHERE id = ${previous.id}::uuid`;
      }

      const perspectiveIds = new Map<PerspectiveKey, string>();
      const kpiIdsByName = new Map<string, string>();

      for (const [order, perspective] of card.perspectives.entries()) {
        const name = perspectiveName(perspective.key);
        const perspectiveRows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM scorecard.perspectives
          WHERE scorecard_id = ${scorecardId}::uuid AND name_en = ${name}
          ORDER BY id LIMIT 1`;
        const perspectiveId = perspectiveRows[0]?.id ?? stableUuid(`perspective:${card.slug}:${perspective.key}`);
        perspectiveIds.set(perspective.key, perspectiveId);

        await tx.$executeRaw`
          INSERT INTO scorecard.perspectives (id, scorecard_id, name_en, name_ar, "order")
          VALUES (${perspectiveId}::uuid, ${scorecardId}::uuid, ${name}, ${name}, ${order})
          ON CONFLICT (id) DO UPDATE SET name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar, "order" = EXCLUDED."order"`;

        const perspectiveScore = Math.round(perspective.kpis.reduce((sum, kpi) => sum + kpi.score, 0) / Math.max(1, perspective.kpis.length));
        await tx.$executeRaw`
          INSERT INTO scorecard.balanced_perspective_profiles (
            perspective_id, perspective_key, owner_initials, owner_color, score, weight
          ) VALUES (
            ${perspectiveId}::uuid, ${perspective.key}, ${perspective.ownerInitials}, ${perspective.ownerColor}, ${perspectiveScore}, ${perspective.weight}
          )
          ON CONFLICT (perspective_id) DO UPDATE SET
            perspective_key = EXCLUDED.perspective_key, owner_initials = EXCLUDED.owner_initials,
            owner_color = EXCLUDED.owner_color, score = EXCLUDED.score, weight = EXCLUDED.weight,
            updated_at = CURRENT_TIMESTAMP`;

        const kpiWeight = Math.round(100 / Math.max(1, perspective.kpis.length));
        for (const [index, kpi] of perspective.kpis.entries()) {
          const kpiId = stableUuid(`kpi:${card.slug}:${perspective.key}:${index}:${kpi.name}`);
          kpiIdsByName.set(kpi.name, kpiId);
          await tx.$executeRaw`
            INSERT INTO scorecard.kpi_snapshots (
              id, perspective_id, name, status, owner_initials, owner_color,
              score, weight, actual, target, variance, trend
            ) VALUES (
              ${kpiId}::uuid, ${perspectiveId}::uuid, ${kpi.name}, ${kpi.status}, ${perspective.ownerInitials}, ${perspective.ownerColor},
              ${kpi.score}, ${kpiWeight}, ${kpi.actual}, ${kpi.target}, ${kpi.variance}, ${JSON.stringify(kpi.trend)}::jsonb
            )
            ON CONFLICT (id) DO UPDATE SET
              perspective_id = EXCLUDED.perspective_id, name = EXCLUDED.name, status = EXCLUDED.status,
              owner_initials = EXCLUDED.owner_initials, owner_color = EXCLUDED.owner_color,
              score = EXCLUDED.score, weight = EXCLUDED.weight, actual = EXCLUDED.actual,
              target = EXCLUDED.target, variance = EXCLUDED.variance, trend = EXCLUDED.trend,
              updated_at = CURRENT_TIMESTAMP`;
          kpiCount += 1;
        }
      }

      let mapRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM scorecard.strategy_maps
        WHERE scorecard_id = ${scorecardId}::uuid AND state = 'published'
        ORDER BY created_at DESC, id DESC LIMIT 1`;
      if (mapRows.length === 0) {
        const mapId = stableUuid(`map:${card.slug}`);
        mapRows = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO scorecard.strategy_maps (id, scorecard_id, state)
          VALUES (${mapId}::uuid, ${scorecardId}::uuid, 'published'::scorecard.strategy_map_state)
          ON CONFLICT (id) DO UPDATE SET scorecard_id = EXCLUDED.scorecard_id, state = EXCLUDED.state
          RETURNING id`;
      }
      const mapId = mapRows[0]!.id;

      const objectiveIds = new Map<string, string>();
      for (const objective of card.objectives) {
        const objectiveId = stableUuid(`objective:${card.slug}:${objective.slug}`);
        const perspectiveId = perspectiveIds.get(objective.perspective);
        if (!perspectiveId) throw new Error(`Missing perspective ${objective.perspective} for ${card.name}`);
        objectiveIds.set(objective.slug, objectiveId);

        await tx.$executeRaw`
          INSERT INTO strategy.strategy_nodes (id, type, name_en, name_ar, plan_version_id, state, created_by)
          VALUES (
            ${objectiveId}::uuid, 'objective'::strategy."StrategyNodeType", ${objective.name}, ${objective.name},
            ${planVersionId}::uuid, 'active'::strategy."StrategyNodeState", ${actorUserId}
          )
          ON CONFLICT (id) DO UPDATE SET
            name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar,
            plan_version_id = EXCLUDED.plan_version_id, state = EXCLUDED.state`;

        await tx.$executeRaw`
          INSERT INTO scorecard.placements (perspective_id, objective_node_id)
          VALUES (${perspectiveId}::uuid, ${objectiveId}::uuid)
          ON CONFLICT (perspective_id, objective_node_id) DO NOTHING`;

        await tx.$executeRaw`
          INSERT INTO scorecard.objective_profiles (
            objective_node_id, scorecard_id, status, progress, owner_name, owner_initials, owner_color, description
          ) VALUES (
            ${objectiveId}::uuid, ${scorecardId}::uuid, ${objective.status}, ${objective.progress}, ${objective.ownerName},
            ${initials(objective.ownerName)}, ${ownerColor[objective.perspective]}, ${objective.description}
          )
          ON CONFLICT (objective_node_id) DO UPDATE SET
            scorecard_id = EXCLUDED.scorecard_id, status = EXCLUDED.status, progress = EXCLUDED.progress,
            owner_name = EXCLUDED.owner_name, owner_initials = EXCLUDED.owner_initials,
            owner_color = EXCLUDED.owner_color, description = EXCLUDED.description, updated_at = CURRENT_TIMESTAMP`;

        for (const kpiName of objective.kpis) {
          const kpiId = kpiIdsByName.get(kpiName);
          if (!kpiId) throw new Error(`Missing KPI ${kpiName} for objective ${objective.name}`);
          await tx.$executeRaw`
            INSERT INTO scorecard.objective_kpi_links (objective_node_id, kpi_snapshot_id)
            VALUES (${objectiveId}::uuid, ${kpiId}::uuid)
            ON CONFLICT DO NOTHING`;
        }
        objectiveCount += 1;
      }

      for (const link of card.links) {
        const fromId = objectiveIds.get(link.from);
        const toId = objectiveIds.get(link.to);
        if (!fromId || !toId) throw new Error(`Invalid map link ${link.from} -> ${link.to} for ${card.name}`);
        await tx.$executeRaw`
          INSERT INTO scorecard.map_links (strategy_map_id, from_objective_id, to_objective_id, strength)
          VALUES (${mapId}::uuid, ${fromId}::uuid, ${toId}::uuid, ${link.strength}::scorecard.map_link_strength)
          ON CONFLICT (strategy_map_id, from_objective_id, to_objective_id)
          DO UPDATE SET strength = EXCLUDED.strength`;
        linkCount += 1;
      }
    });
  }

  console.log(`Seeded professional connected demo data: ${cards.length} scorecards, ${kpiCount} KPIs, ${objectiveCount} objectives, ${linkCount} map connections`);
}

main()
  .catch((error: unknown) => {
    console.error("Balanced Scorecard seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
