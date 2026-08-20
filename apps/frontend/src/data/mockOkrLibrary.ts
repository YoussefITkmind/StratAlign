export type OkrStatus = "on-track" | "at-risk" | "behind";
export type OkrApproval = "draft" | "pending" | "approved";

export interface OkrOwner {
  initials: string;
  name: string;
  color: string;
}

export interface KeyResult {
  id: string;
  label: string;
  actual: string;
  target: string;
  progress: number;
  owner: OkrOwner;
  status: OkrStatus;
  dueDate: string;
}

export interface Objective {
  id: string;
  title: string;
  department: string;
  quarter: string;
  owner: OkrOwner;
  status: OkrStatus;
  approval: OkrApproval;
  progress: number;
  keyResults: KeyResult[];
}

// Explicit literal classes (not a hash-derived lookup) so Tailwind's
// content scanner reliably picks every one of them up at build time.
const OWNERS: Record<string, OkrOwner> = {
  SC: { initials: "SC", name: "Sarah Chen", color: "bg-indigo-600" },
  MW: { initials: "MW", name: "Mike Wallace", color: "bg-amber-600" },
  PN: { initials: "PN", name: "Priya Nair", color: "bg-cyan-600" },
  DF: { initials: "DF", name: "Dana Fisher", color: "bg-emerald-600" },
  AM: { initials: "AM", name: "Alex Morgan", color: "bg-blue-600" },
  TR: { initials: "TR", name: "Tom Reilly", color: "bg-rose-600" },
};

export const objectives: Objective[] = [
  {
    id: "okr-revenue-growth",
    title: "Drive Revenue Growth 40% YoY",
    department: "Sales",
    quarter: "Q3 2025",
    owner: OWNERS.SC,
    status: "at-risk",
    approval: "approved",
    progress: 67,
    keyResults: [
      { id: "kr-arr", label: "Achieve $48M ARR by Dec 2025", actual: "$32M", target: "$48M", progress: 67, owner: OWNERS.SC, status: "at-risk", dueDate: "Dec 31, 2025" },
      { id: "kr-logos", label: "Win 50 new enterprise logos (ACV >$50K)", actual: "24 logos", target: "50 logos", progress: 48, owner: OWNERS.TR, status: "behind", dueDate: "Dec 31, 2025" },
      { id: "kr-markets", label: "Expand into 3 new geographic markets", actual: "1 market", target: "3 markets", progress: 33, owner: OWNERS.TR, status: "behind", dueDate: "Dec 31, 2025" },
    ],
  },
  {
    id: "okr-customer-success",
    title: "Achieve World-Class Customer Success",
    department: "Customer Success",
    quarter: "Q3 2025",
    owner: OWNERS.MW,
    status: "on-track",
    approval: "approved",
    progress: 82,
    keyResults: [
      { id: "kr-retention", label: "Achieve 95% customer retention rate", actual: "94.5%", target: "95%", progress: 99, owner: OWNERS.MW, status: "on-track", dueDate: "Dec 31, 2025" },
      { id: "kr-csat", label: "Improve CSAT score to 4.5", actual: "4.1", target: "4.5", progress: 87, owner: OWNERS.MW, status: "on-track", dueDate: "Dec 31, 2025" },
      { id: "kr-ticket-time", label: "Reduce ticket resolution time to 12 hrs", actual: "18.5 hrs", target: "12 hrs", progress: 61, owner: OWNERS.MW, status: "at-risk", dueDate: "Dec 31, 2025" },
    ],
  },
  {
    id: "okr-engineering-velocity",
    title: "Scale Engineering Velocity 2x",
    department: "Engineering",
    quarter: "Q3 2025",
    owner: OWNERS.PN,
    status: "on-track",
    approval: "approved",
    progress: 78,
    keyResults: [
      { id: "kr-velocity", label: "Increase sprint velocity to 42 pts", actual: "34 pts", target: "42 pts", progress: 68, owner: OWNERS.PN, status: "at-risk", dueDate: "Dec 31, 2025" },
      { id: "kr-uptime", label: "Achieve 99.9% system uptime", actual: "98.2%", target: "99.9%", progress: 55, owner: OWNERS.PN, status: "at-risk", dueDate: "Dec 31, 2025" },
      { id: "kr-deploys", label: "Reach 10 deployments per week", actual: "8.4/wk", target: "10/wk", progress: 84, owner: OWNERS.PN, status: "on-track", dueDate: "Dec 31, 2025" },
    ],
  },
  {
    id: "okr-culture",
    title: "Build a High-Performance Culture",
    department: "HR",
    quarter: "Q3 2025",
    owner: OWNERS.DF,
    status: "on-track",
    approval: "approved",
    progress: 74,
    keyResults: [
      { id: "kr-enps", label: "Raise employee eNPS to 60", actual: "54", target: "60", progress: 90, owner: OWNERS.DF, status: "on-track", dueDate: "Dec 31, 2025" },
      { id: "kr-turnover", label: "Reduce employee turnover to 8%", actual: "6.2%", target: "8%", progress: 100, owner: OWNERS.DF, status: "on-track", dueDate: "Dec 31, 2025" },
      { id: "kr-training", label: "Reach 90% training completion", actual: "71%", target: "90%", progress: 79, owner: OWNERS.DF, status: "at-risk", dueDate: "Dec 31, 2025" },
    ],
  },
  {
    id: "okr-financial-discipline",
    title: "Strengthen Financial Discipline",
    department: "Finance",
    quarter: "Q3 2025",
    owner: OWNERS.AM,
    status: "on-track",
    approval: "approved",
    progress: 85,
    keyResults: [
      { id: "kr-margin", label: "Grow gross margin to 65%", actual: "68%", target: "65%", progress: 100, owner: OWNERS.AM, status: "on-track", dueDate: "Dec 31, 2025" },
      { id: "kr-rev-growth", label: "Grow revenue 10% QoQ", actual: "12.4%", target: "10%", progress: 100, owner: OWNERS.AM, status: "on-track", dueDate: "Dec 31, 2025" },
      { id: "kr-cac", label: "Cut customer acquisition cost to $4,800", actual: "$5,200", target: "$4,800", progress: 55, owner: OWNERS.AM, status: "at-risk", dueDate: "Dec 31, 2025" },
    ],
  },
  {
    id: "okr-market-expansion",
    title: "Accelerate Market Expansion",
    department: "Marketing",
    quarter: "Q3 2025",
    owner: OWNERS.TR,
    status: "at-risk",
    approval: "pending",
    progress: 58,
    keyResults: [
      { id: "kr-conversion", label: "Increase lead conversion rate to 4%", actual: "3.1%", target: "4%", progress: 62, owner: OWNERS.TR, status: "at-risk", dueDate: "Dec 31, 2025" },
      { id: "kr-new-markets", label: "Launch in 3 new markets", actual: "1 market", target: "3 markets", progress: 33, owner: OWNERS.TR, status: "behind", dueDate: "Dec 31, 2025" },
      { id: "kr-pipeline", label: "Build $10M in qualified pipeline", actual: "$7.9M", target: "$10M", progress: 79, owner: OWNERS.TR, status: "on-track", dueDate: "Dec 31, 2025" },
    ],
  },
];

export const okrDepartments = Array.from(new Set(objectives.map((o) => o.department))).sort();

export const okrLibraryStats = {
  objectiveCount: objectives.length,
  avgProgress: Math.round(objectives.reduce((sum, o) => sum + o.progress, 0) / objectives.length),
  keyResultCount: objectives.reduce((sum, o) => sum + o.keyResults.length, 0),
};

export function newOwnerFromName(name: string): OkrOwner {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";
  const palette = ["bg-blue-600", "bg-emerald-600", "bg-amber-600", "bg-rose-600", "bg-cyan-600", "bg-violet-600"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return { initials, name: name.trim() || "Unassigned", color: palette[Math.abs(hash) % palette.length] };
}
