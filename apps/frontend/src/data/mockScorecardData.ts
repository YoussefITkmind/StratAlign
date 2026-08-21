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
        owner: owner("Sarah Chen"),
        score: 72,
        priorScore: 68,
        weight: 35,
        kpis: [
          {
            id: "kpi-corp-fin-1", name: "Revenue Growth (YoY)", status: "on-track", owner: owner("Sarah Chen"), score: 95, priorScore: 90,
            weight: 40, actual: "38%", target: "40%", variance: "-2%", trend: [34, 36, 33, 37, 35, 38],
          },
          {
            id: "kpi-corp-fin-2", name: "Gross Margin", status: "on-track", owner: owner("Sarah Chen"), score: 97, priorScore: 94,
            weight: 30, actual: "68%", target: "70%", variance: "-2%", trend: [60, 62, 64, 65, 67, 68],
          },
          {
            id: "kpi-corp-fin-3", name: "Operating Cost Reduction", status: "on-track", owner: owner("Jamie Park"), score: 100, priorScore: 96,
            weight: 20, actual: "-12%", target: "-15%", variance: "+3%", trend: [-5, -7, -8, -9, -10, -12],
          },
          {
            id: "kpi-corp-fin-4", name: "New Enterprise ARR ($M)", status: "at-risk", owner: owner("Tom Reilly"), score: 52, priorScore: 58,
            weight: 10, actual: "$4.2M", target: "$8.0M", variance: "-$3.8M", trend: [7.0, 6.5, 6.0, 5.2, 4.6, 4.2],
          },
        ],
      },
      {
        id: "sc-corporate-customer",
        key: "customer",
        owner: owner("Priya Nair"),
        score: 82,
        priorScore: 78,
        weight: 25,
        kpis: [
          {
            id: "kpi-corp-cust-1", name: "Net Promoter Score", status: "on-track", owner: owner("Priya Nair"), score: 90, priorScore: 84,
            weight: 50, actual: "81%", target: "78%", variance: "+3%", trend: [70, 74, 76, 79, 80, 81],
          },
          {
            id: "kpi-corp-cust-2", name: "Customer Retention Rate", status: "on-track", owner: owner("Priya Nair"), score: 88, priorScore: 85,
            weight: 50, actual: "76%", target: "72%", variance: "+4%", trend: [70, 72, 73, 75, 76, 76],
          },
        ],
      },
      {
        id: "sc-corporate-internal-process",
        key: "internal-process",
        owner: owner("Tom Reilly"),
        score: 65,
        priorScore: 69,
        weight: 25,
        kpis: [
          {
            id: "kpi-corp-proc-1", name: "Process Cycle Time", status: "at-risk", owner: owner("Tom Reilly"), score: 58, priorScore: 63,
            weight: 60, actual: "5.8 days", target: "5.0 days", variance: "+0.8 days", trend: [7, 6.8, 6.5, 6.2, 6.0, 5.8],
          },
          {
            id: "kpi-corp-proc-2", name: "Quality Index", status: "on-track", owner: owner("Tom Reilly"), score: 90, priorScore: 89,
            weight: 40, actual: "90%", target: "88%", variance: "+2%", trend: [85, 86, 87, 88, 89, 90],
          },
        ],
      },
      {
        id: "sc-corporate-learning-growth",
        key: "learning-growth",
        owner: owner("Jamie Park"),
        score: 91,
        priorScore: 86,
        weight: 15,
        kpis: [
          {
            id: "kpi-corp-learn-1", name: "Employee Engagement", status: "on-track", owner: owner("Jamie Park"), score: 86, priorScore: 83,
            weight: 50, actual: "86%", target: "80%", variance: "+6%", trend: [78, 80, 82, 84, 85, 86],
          },
          {
            id: "kpi-corp-learn-2", name: "Training Completion Rate", status: "on-track", owner: owner("Jamie Park"), score: 96, priorScore: 90,
            weight: 50, actual: "96%", target: "90%", variance: "+6%", trend: [85, 88, 90, 92, 94, 96],
          },
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
          {
            id: "kpi-sales-fin-1", name: "Pipeline Coverage Ratio", status: "on-track", owner: owner("Jamie Park"), score: 82, priorScore: 85,
            weight: 50, actual: "3.4x", target: "3.0x", variance: "+0.4x", trend: [2.8, 2.9, 3.1, 3.2, 3.3, 3.4],
          },
          {
            id: "kpi-sales-fin-2", name: "Win Rate", status: "on-track", owner: owner("Dana Cole"), score: 78, priorScore: 81,
            weight: 50, actual: "31%", target: "35%", variance: "-4%", trend: [35, 34, 33, 32, 31, 31],
          },
        ],
      },
      {
        id: "sc-sales-customer",
        key: "customer",
        owner: owner("Dana Cole"),
        score: 72,
        priorScore: 75,
        weight: PERSPECTIVE_WEIGHTS.customer,
        kpis: [
          {
            id: "kpi-sales-cust-1", name: "Sales-Qualified Lead Conversion", status: "at-risk", owner: owner("Dana Cole"), score: 61, priorScore: 66,
            weight: 100, actual: "18%", target: "24%", variance: "-6%", trend: [24, 22, 21, 20, 19, 18],
          },
        ],
      },
      {
        id: "sc-sales-internal-process",
        key: "internal-process",
        owner: owner("Jamie Park"),
        score: 70,
        priorScore: 72,
        weight: PERSPECTIVE_WEIGHTS["internal-process"],
        kpis: [
          {
            id: "kpi-sales-proc-1", name: "Deal Cycle Time", status: "on-track", owner: owner("Jamie Park"), score: 75, priorScore: 77,
            weight: 100, actual: "42 days", target: "45 days", variance: "-3 days", trend: [48, 46, 45, 44, 43, 42],
          },
        ],
      },
      {
        id: "sc-sales-learning-growth",
        key: "learning-growth",
        owner: owner("Dana Cole"),
        score: 81,
        priorScore: 78,
        weight: PERSPECTIVE_WEIGHTS["learning-growth"],
        kpis: [
          {
            id: "kpi-sales-learn-1", name: "Sales Certification Rate", status: "on-track", owner: owner("Dana Cole"), score: 83, priorScore: 79,
            weight: 100, actual: "83%", target: "80%", variance: "+3%", trend: [72, 75, 77, 79, 81, 83],
          },
        ],
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
        kpis: [
          {
            id: "kpi-mktg-fin-1", name: "Marketing ROI", status: "at-risk", owner: owner("Priya Nair"), score: 58, priorScore: 64,
            weight: 100, actual: "2.1x", target: "3.0x", variance: "-0.9x", trend: [3.0, 2.8, 2.6, 2.4, 2.2, 2.1],
          },
        ],
      },
      {
        id: "sc-marketing-customer",
        key: "customer",
        owner: owner("Priya Nair"),
        score: 65,
        priorScore: 68,
        weight: PERSPECTIVE_WEIGHTS.customer,
        kpis: [
          {
            id: "kpi-mktg-cust-1", name: "Brand Awareness Index", status: "on-track", owner: owner("Priya Nair"), score: 79, priorScore: 75,
            weight: 50, actual: "62%", target: "58%", variance: "+4%", trend: [52, 55, 57, 59, 61, 62],
          },
          {
            id: "kpi-mktg-cust-2", name: "Lead Conversion Rate", status: "at-risk", owner: owner("Priya Nair"), score: 52, priorScore: 61,
            weight: 50, actual: "9%", target: "14%", variance: "-5%", trend: [14, 13, 12, 11, 10, 9],
          },
        ],
      },
      {
        id: "sc-marketing-internal-process",
        key: "internal-process",
        owner: owner("Tom Reilly"),
        score: 60,
        priorScore: 65,
        weight: PERSPECTIVE_WEIGHTS["internal-process"],
        kpis: [
          {
            id: "kpi-mktg-proc-1", name: "Campaign Launch Cycle Time", status: "at-risk", owner: owner("Tom Reilly"), score: 60, priorScore: 65,
            weight: 100, actual: "18 days", target: "14 days", variance: "+4 days", trend: [13, 14, 15, 16, 17, 18],
          },
        ],
      },
      {
        id: "sc-marketing-learning-growth",
        key: "learning-growth",
        owner: owner("Priya Nair"),
        score: 66,
        priorScore: 67,
        weight: PERSPECTIVE_WEIGHTS["learning-growth"],
        kpis: [
          {
            id: "kpi-mktg-learn-1", name: "Team Skills Coverage", status: "on-track", owner: owner("Priya Nair"), score: 77, priorScore: 74,
            weight: 100, actual: "77%", target: "75%", variance: "+2%", trend: [70, 72, 73, 75, 76, 77],
          },
        ],
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
        kpis: [
          {
            id: "kpi-ops-proc-1", name: "Supply Chain Reliability", status: "draft", owner: owner("Tom Reilly"), score: 0,
            weight: 100, actual: "—", target: "95%", variance: "—", trend: [],
          },
        ],
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
