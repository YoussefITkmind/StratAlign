// Demo dataset for the Initiatives & Projects board (Cards / Kanban / Gantt views).
// The Register tab and Initiative Detail page use the real execution.initiative API instead —
// this dataset only backs the cosmetic multi-view dashboard fields (budget, risk counts, avatars)
// that don't have a backing API yet.

export type InitiativeColor = "sky" | "violet" | "emerald" | "purple" | "red" | "orange" | "pink" | "amber";
export type InitiativePriority = "Critical" | "High" | "Medium" | "Low";
export type InitiativeBoardStatus = "In Progress" | "On Track" | "At Risk" | "Behind" | "Draft";

export interface TeamMember {
  initials: string;
  color: string;
}

export interface MockInitiative {
  id: string;
  name: string;
  description: string;
  color: InitiativeColor;
  priority: InitiativePriority;
  status: InitiativeBoardStatus;
  department: string;
  play: string;
  owner: string;
  ownerInitials: string;
  stage: "Discovery" | "Execution" | "Delivery" | "Planning";
  confidence: "High" | "Medium" | "Low";
  progress: number;
  milestonesDone: number;
  milestonesTotal: number;
  risks: number;
  linkedProjects: number;
  team: TeamMember[];
  dueDate: string;
  startMonth: number;
  endMonth: number;
  lastUpdate: string;
  sponsor: string;
  startDateLabel: string;
  endDateLabel: string;
  teamSize: number;
  isMyPlay: boolean;
}

export const GANTT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
  "Jan'26",
  "Feb'26",
];

export const MOCK_INITIATIVES: MockInitiative[] = [
  {
    id: "crm-platform-migration",
    name: "CRM Platform Migration",
    description:
      "Full migration from legacy Salesforce Classic to Salesforce Lightning with custom CPQ and territory management rebuild.",
    color: "sky",
    priority: "Critical",
    status: "In Progress",
    department: "Sales",
    play: "Commercial Excellence",
    owner: "Sarah Chen",
    ownerInitials: "SC",
    stage: "Execution",
    confidence: "Medium",
    progress: 62,
    milestonesDone: 2,
    milestonesTotal: 4,
    risks: 2,
    linkedProjects: 2,
    team: [
      { initials: "SC", color: "bg-[#0B2942]" },
      { initials: "TR", color: "bg-cyan-600" },
      { initials: "PN", color: "bg-emerald-600" },
    ],
    dueDate: "Sep 2025",
    startMonth: 0,
    endMonth: 8,
    lastUpdate: "Jul 31, 2025",
    sponsor: "Alex Morgan",
    startDateLabel: "Jan 2025",
    endDateLabel: "Sep 2025",
    teamSize: 6,
    isMyPlay: true,
  },
  {
    id: "ai-powered-support-bot",
    name: "AI-Powered Support Bot",
    description:
      "Deploy LLM-based tier-1 support deflection covering top 200 support topics, integrated with the existing Zendesk queue.",
    color: "violet",
    priority: "High",
    status: "In Progress",
    department: "Customer Success",
    play: "AI & Automation",
    owner: "Mike Wong",
    ownerInitials: "MW",
    stage: "Execution",
    confidence: "Medium",
    progress: 44,
    milestonesDone: 2,
    milestonesTotal: 4,
    risks: 2,
    linkedProjects: 1,
    team: [
      { initials: "MW", color: "bg-[#0B2942]" },
      { initials: "PN", color: "bg-emerald-600" },
      { initials: "AM", color: "bg-emerald-500" },
    ],
    dueDate: "Nov 2025",
    startMonth: 3,
    endMonth: 10,
    lastUpdate: "Jul 31, 2025",
    sponsor: "Alex Morgan",
    startDateLabel: "Apr 2025",
    endDateLabel: "Nov 2025",
    teamSize: 5,
    isMyPlay: false,
  },
  {
    id: "cloud-infrastructure-modernization",
    name: "Cloud Infrastructure Modernization",
    description:
      "Migrate 80% of workloads to AWS, retire 3 on-prem data centers, and achieve SOC 2 Type II compliance. Primary enabler for platform scalability.",
    color: "emerald",
    priority: "Critical",
    status: "On Track",
    department: "Engineering",
    play: "Platform Scalability",
    owner: "Priya Nair",
    ownerInitials: "PN",
    stage: "Execution",
    confidence: "High",
    progress: 55,
    milestonesDone: 2,
    milestonesTotal: 5,
    risks: 2,
    linkedProjects: 0,
    team: [
      { initials: "PN", color: "bg-[#0B2942]" },
      { initials: "JP", color: "bg-blue-600" },
      { initials: "AM", color: "bg-emerald-500" },
    ],
    dueDate: "Dec 2025",
    startMonth: 0,
    endMonth: 11,
    lastUpdate: "Jul 31, 2025",
    sponsor: "Alex Morgan",
    startDateLabel: "Jan 2025",
    endDateLabel: "Dec 2025",
    teamSize: 3,
    isMyPlay: false,
  },
  {
    id: "enterprise-sso-rollout",
    name: "Enterprise SSO Rollout",
    description:
      "Implement SAML 2.0 and OIDC-based SSO across all StratAlign modules, supporting Okta and Azure AD as primary identity providers.",
    color: "purple",
    priority: "High",
    status: "On Track",
    department: "Engineering",
    play: "Enterprise Security",
    owner: "Priya Nair",
    ownerInitials: "PN",
    stage: "Delivery",
    confidence: "High",
    progress: 78,
    milestonesDone: 2,
    milestonesTotal: 3,
    risks: 1,
    linkedProjects: 1,
    team: [
      { initials: "PN", color: "bg-[#0B2942]" },
      { initials: "JP", color: "bg-blue-600" },
    ],
    dueDate: "Aug 2025",
    startMonth: 3,
    endMonth: 7,
    lastUpdate: "Jul 31, 2025",
    sponsor: "Alex Morgan",
    startDateLabel: "Apr 2025",
    endDateLabel: "Aug 2025",
    teamSize: 2,
    isMyPlay: true,
  },
  {
    id: "apac-market-expansion",
    name: "APAC Market Expansion",
    description: "Establish legal entities, hire 12 FTEs, open regional offices in Singapore and Sydney.",
    color: "red",
    priority: "Critical",
    status: "Behind",
    department: "Sales / APAC",
    play: "Market Expansion",
    owner: "Tom Reyes",
    ownerInitials: "TR",
    stage: "Execution",
    confidence: "Low",
    progress: 31,
    milestonesDone: 1,
    milestonesTotal: 5,
    risks: 3,
    linkedProjects: 0,
    team: [
      { initials: "TR", color: "bg-cyan-600" },
      { initials: "DF", color: "bg-[#0B2942]" },
      { initials: "SC", color: "bg-[#0B2942]" },
    ],
    dueDate: "Dec 2025",
    startMonth: 0,
    endMonth: 11,
    lastUpdate: "Jul 31, 2025",
    sponsor: "Alex Morgan",
    startDateLabel: "Jan 2025",
    endDateLabel: "Dec 2025",
    teamSize: 12,
    isMyPlay: false,
  },
  {
    id: "analytics-data-warehouse",
    name: "Analytics Data Warehouse",
    description: "Build a unified data warehouse on Snowflake, replacing 6 fragmented reporting data marts.",
    color: "orange",
    priority: "High",
    status: "At Risk",
    department: "Operations",
    play: "Data-Driven Culture",
    owner: "James Park",
    ownerInitials: "JP",
    stage: "Discovery",
    confidence: "Medium",
    progress: 48,
    milestonesDone: 1,
    milestonesTotal: 4,
    risks: 2,
    linkedProjects: 2,
    team: [
      { initials: "JP", color: "bg-blue-600" },
      { initials: "PN", color: "bg-emerald-600" },
    ],
    dueDate: "Oct 2025",
    startMonth: 3,
    endMonth: 9,
    lastUpdate: "Jul 15, 2025",
    sponsor: "Alex Morgan",
    startDateLabel: "Apr 2025",
    endDateLabel: "Oct 2025",
    teamSize: 4,
    isMyPlay: false,
  },
  {
    id: "ld-platform-upgrade",
    name: "L&D Platform Upgrade",
    description: "Replace legacy LMS with Cornerstone, migrating 40 course catalogs and certification tracks.",
    color: "pink",
    priority: "Medium",
    status: "On Track",
    department: "HR",
    play: "People & Culture",
    owner: "Diana Farouk",
    ownerInitials: "DF",
    stage: "Delivery",
    confidence: "High",
    progress: 67,
    milestonesDone: 2,
    milestonesTotal: 5,
    risks: 0,
    linkedProjects: 0,
    team: [{ initials: "DF", color: "bg-[#0B2942]" }],
    dueDate: "Sep 2025",
    startMonth: 4,
    endMonth: 9,
    lastUpdate: "Jul 31, 2025",
    sponsor: "Alex Morgan",
    startDateLabel: "May 2025",
    endDateLabel: "Sep 2025",
    teamSize: 3,
    isMyPlay: false,
  },
  {
    id: "revenue-intelligence-dashboard",
    name: "Revenue Intelligence Dashboard",
    description: "Build an executive-level revenue intelligence dashboard combining pipeline, forecast, and win-rate signals.",
    color: "amber",
    priority: "Medium",
    status: "Draft",
    department: "Sales",
    play: "Revenue Intelligence",
    owner: "Sarah Chen",
    ownerInitials: "SC",
    stage: "Planning",
    confidence: "Medium",
    progress: 8,
    milestonesDone: 0,
    milestonesTotal: 3,
    risks: 0,
    linkedProjects: 1,
    team: [
      { initials: "SC", color: "bg-[#0B2942]" },
      { initials: "JP", color: "bg-blue-600" },
    ],
    dueDate: "Feb 2026",
    startMonth: 11,
    endMonth: 13,
    lastUpdate: "Sep 10, 2025",
    sponsor: "Alex Morgan",
    startDateLabel: "Dec 2025",
    endDateLabel: "Feb 2026",
    teamSize: 2,
    isMyPlay: false,
  },
];

export const COLOR_TOKENS: Record<InitiativeColor, { bar: string; bg: string; text: string; dot: string }> = {
  sky: { bar: "bg-sky-400", bg: "bg-sky-50", text: "text-sky-700", dot: "bg-sky-500" },
  violet: { bar: "bg-violet-500", bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
  emerald: { bar: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  purple: { bar: "bg-purple-500", bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  red: { bar: "bg-red-500", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  orange: { bar: "bg-orange-400", bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
  pink: { bar: "bg-pink-500", bg: "bg-pink-50", text: "text-pink-700", dot: "bg-pink-500" },
  amber: { bar: "bg-amber-400", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
};

export const PRIORITY_TOKENS: Record<InitiativePriority, string> = {
  Critical: "bg-red-50 text-red-700",
  High: "bg-amber-50 text-amber-700",
  Medium: "bg-blue-50 text-blue-700",
  Low: "bg-slate-100 text-slate-600",
};

export const PRIORITY_DOT: Record<InitiativePriority, string> = {
  Critical: "bg-red-500",
  High: "bg-amber-500",
  Medium: "bg-blue-500",
  Low: "bg-slate-400",
};

export const STATUS_TOKENS: Record<InitiativeBoardStatus, string> = {
  "In Progress": "bg-blue-50 text-blue-700",
  "On Track": "bg-emerald-50 text-emerald-700",
  "At Risk": "bg-orange-50 text-orange-700",
  Behind: "bg-red-50 text-red-700",
  Draft: "bg-slate-100 text-slate-500",
};

export const STATUS_DOT: Record<InitiativeBoardStatus, string> = {
  "In Progress": "bg-blue-500",
  "On Track": "bg-emerald-500",
  "At Risk": "bg-orange-500",
  Behind: "bg-red-500",
  Draft: "bg-slate-400",
};

export const CONFIDENCE_DOT: Record<"High" | "Medium" | "Low", string> = {
  High: "bg-emerald-500",
  Medium: "bg-amber-500",
  Low: "bg-red-500",
};

export const STAGE_TOKENS: Record<MockInitiative["stage"], string> = {
  Discovery: "bg-purple-50 text-purple-700 border border-purple-200",
  Execution: "bg-blue-50 text-blue-700 border border-blue-200",
  Delivery: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  Planning: "bg-slate-50 text-slate-600 border border-slate-200",
};

export const KANBAN_COLUMNS: InitiativeBoardStatus[] = ["Draft", "In Progress", "On Track", "At Risk", "Behind"];
