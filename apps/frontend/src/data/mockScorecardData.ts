import { Scorecard } from "@/types/scorecard";
import { colorForInitials, DEFAULT_PERSPECTIVE_WEIGHTS } from "@/lib/scorecardConfig";

function owner(name: string) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return { initials, color: colorForInitials(initials) };
}

const PERSPECTIVE_WEIGHTS = DEFAULT_PERSPECTIVE_WEIGHTS;

export const initialScorecards: Scorecard[] = [
  {
    id: "sc-corporate",
    name: "Corporate Strategy Scorecard",
    department: "Corporate",
    period: "Q3 2025",
    ownerName: "Alex Morgan",
    status: "on-track",
    score: 82,
    priorScore: 77,
    mapId: "map-corporate",
    perspectives: [
      {
        id: "sc-corporate-financial",
        key: "financial",
        owner: owner("Alex Morgan"),
        score: 85,
        priorScore: 80,
        weight: PERSPECTIVE_WEIGHTS.financial,
        kpis: [
          { id: "kpi-corp-fin-1", name: "Revenue Growth", status: "on-track", owner: owner("Alex Morgan"), score: 88, priorScore: 82 },
          { id: "kpi-corp-fin-2", name: "Operating Margin", status: "on-track", owner: owner("Jamie Park"), score: 84, priorScore: 81 },
          { id: "kpi-corp-fin-3", name: "EBITDA Growth", status: "at-risk", owner: owner("Alex Morgan"), score: 62, priorScore: 65 },
        ],
      },
      {
        id: "sc-corporate-customer",
        key: "customer",
        owner: owner("Priya Nair"),
        score: 78,
        priorScore: 74,
        weight: PERSPECTIVE_WEIGHTS.customer,
        kpis: [
          { id: "kpi-corp-cust-1", name: "Net Promoter Score", status: "on-track", owner: owner("Priya Nair"), score: 81, priorScore: 76 },
          { id: "kpi-corp-cust-2", name: "Customer Retention Rate", status: "on-track", owner: owner("Priya Nair"), score: 76, priorScore: 73 },
        ],
      },
      {
        id: "sc-corporate-internal-process",
        key: "internal-process",
        owner: owner("Tom Reilly"),
        score: 74,
        priorScore: 76,
        weight: PERSPECTIVE_WEIGHTS["internal-process"],
        kpis: [
          { id: "kpi-corp-proc-1", name: "Process Cycle Time", status: "at-risk", owner: owner("Tom Reilly"), score: 58, priorScore: 63 },
          { id: "kpi-corp-proc-2", name: "Quality Index", status: "on-track", owner: owner("Tom Reilly"), score: 90, priorScore: 89 },
        ],
      },
      {
        id: "sc-corporate-learning-growth",
        key: "learning-growth",
        owner: owner("Jamie Park"),
        score: 88,
        priorScore: 84,
        weight: PERSPECTIVE_WEIGHTS["learning-growth"],
        kpis: [
          { id: "kpi-corp-learn-1", name: "Employee Engagement", status: "on-track", owner: owner("Jamie Park"), score: 86, priorScore: 83 },
          { id: "kpi-corp-learn-2", name: "Training Completion Rate", status: "on-track", owner: owner("Jamie Park"), score: 90, priorScore: 85 },
        ],
      },
    ],
  },
  {
    id: "sc-sales",
    name: "Sales Performance Scorecard",
    department: "Sales",
    period: "Q3 2025",
    ownerName: "Jamie Park",
    status: "on-track",
    score: 76,
    priorScore: 79,
    perspectives: [
      {
        id: "sc-sales-financial",
        key: "financial",
        owner: owner("Jamie Park"),
        score: 80,
        priorScore: 83,
        weight: PERSPECTIVE_WEIGHTS.financial,
        kpis: [
          { id: "kpi-sales-fin-1", name: "Pipeline Coverage Ratio", status: "on-track", owner: owner("Jamie Park"), score: 82, priorScore: 85 },
          { id: "kpi-sales-fin-2", name: "Win Rate", status: "on-track", owner: owner("Dana Cole"), score: 78, priorScore: 81 },
        ],
      },
      {
        id: "sc-sales-customer",
        key: "customer",
        owner: owner("Dana Cole"),
        score: 72,
        priorScore: 75,
        weight: PERSPECTIVE_WEIGHTS.customer,
        kpis: [{ id: "kpi-sales-cust-1", name: "Sales-Qualified Lead Conversion", status: "at-risk", owner: owner("Dana Cole"), score: 61, priorScore: 66 }],
      },
      {
        id: "sc-sales-internal-process",
        key: "internal-process",
        owner: owner("Jamie Park"),
        score: 70,
        priorScore: 72,
        weight: PERSPECTIVE_WEIGHTS["internal-process"],
        kpis: [{ id: "kpi-sales-proc-1", name: "Deal Cycle Time", status: "on-track", owner: owner("Jamie Park"), score: 75, priorScore: 77 }],
      },
      {
        id: "sc-sales-learning-growth",
        key: "learning-growth",
        owner: owner("Dana Cole"),
        score: 81,
        priorScore: 78,
        weight: PERSPECTIVE_WEIGHTS["learning-growth"],
        kpis: [{ id: "kpi-sales-learn-1", name: "Sales Certification Rate", status: "on-track", owner: owner("Dana Cole"), score: 83, priorScore: 79 }],
      },
    ],
  },
  {
    id: "sc-marketing",
    name: "Marketing Scorecard",
    department: "Marketing",
    period: "Q3 2025",
    ownerName: "Priya Nair",
    status: "at-risk",
    score: 61,
    priorScore: 66,
    perspectives: [
      {
        id: "sc-marketing-financial",
        key: "financial",
        owner: owner("Priya Nair"),
        score: 58,
        priorScore: 64,
        weight: PERSPECTIVE_WEIGHTS.financial,
        kpis: [{ id: "kpi-mktg-fin-1", name: "Marketing ROI", status: "at-risk", owner: owner("Priya Nair"), score: 58, priorScore: 64 }],
      },
      {
        id: "sc-marketing-customer",
        key: "customer",
        owner: owner("Priya Nair"),
        score: 65,
        priorScore: 68,
        weight: PERSPECTIVE_WEIGHTS.customer,
        kpis: [
          { id: "kpi-mktg-cust-1", name: "Brand Awareness Index", status: "on-track", owner: owner("Priya Nair"), score: 79, priorScore: 75 },
          { id: "kpi-mktg-cust-2", name: "Lead Conversion Rate", status: "at-risk", owner: owner("Priya Nair"), score: 52, priorScore: 61 },
        ],
      },
      {
        id: "sc-marketing-internal-process",
        key: "internal-process",
        owner: owner("Tom Reilly"),
        score: 60,
        priorScore: 65,
        weight: PERSPECTIVE_WEIGHTS["internal-process"],
        kpis: [{ id: "kpi-mktg-proc-1", name: "Campaign Launch Cycle Time", status: "at-risk", owner: owner("Tom Reilly"), score: 60, priorScore: 65 }],
      },
      {
        id: "sc-marketing-learning-growth",
        key: "learning-growth",
        owner: owner("Priya Nair"),
        score: 66,
        priorScore: 67,
        weight: PERSPECTIVE_WEIGHTS["learning-growth"],
        kpis: [{ id: "kpi-mktg-learn-1", name: "Team Skills Coverage", status: "on-track", owner: owner("Priya Nair"), score: 77, priorScore: 74 }],
      },
    ],
  },
  {
    id: "sc-operations",
    name: "Operations Excellence Scorecard",
    department: "Operations",
    period: "Q3 2025",
    ownerName: "Tom Reilly",
    status: "draft",
    score: 0,
    perspectives: [
      {
        id: "sc-operations-financial",
        key: "financial",
        owner: owner("Tom Reilly"),
        score: 0,
        weight: PERSPECTIVE_WEIGHTS.financial,
        kpis: [],
      },
      {
        id: "sc-operations-customer",
        key: "customer",
        owner: owner("Tom Reilly"),
        score: 0,
        weight: PERSPECTIVE_WEIGHTS.customer,
        kpis: [],
      },
      {
        id: "sc-operations-internal-process",
        key: "internal-process",
        owner: owner("Tom Reilly"),
        score: 0,
        weight: PERSPECTIVE_WEIGHTS["internal-process"],
        kpis: [{ id: "kpi-ops-proc-1", name: "Supply Chain Reliability", status: "draft", owner: owner("Tom Reilly"), score: 0 }],
      },
      {
        id: "sc-operations-learning-growth",
        key: "learning-growth",
        owner: owner("Tom Reilly"),
        score: 0,
        weight: PERSPECTIVE_WEIGHTS["learning-growth"],
        kpis: [],
      },
    ],
  },
];
