import { Scorecard } from "@/types/scorecard";
import { colorForInitials } from "@/lib/scorecardConfig";

function owner(name: string) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return { initials, color: colorForInitials(initials) };
}

export const initialScorecards: Scorecard[] = [
  {
    id: "sc-corporate",
    name: "Corporate Strategy Scorecard",
    department: "Corporate",
    period: "Q3 2025",
    ownerName: "Alex Morgan",
    status: "on-track",
    score: 82,
    perspectives: [
      {
        id: "sc-corporate-financial",
        key: "financial",
        owner: owner("Alex Morgan"),
        score: 85,
        kpis: [
          { id: "kpi-corp-fin-1", name: "Revenue Growth", status: "on-track", owner: owner("Alex Morgan") },
          { id: "kpi-corp-fin-2", name: "Operating Margin", status: "on-track", owner: owner("Jamie Park") },
          { id: "kpi-corp-fin-3", name: "EBITDA Growth", status: "at-risk", owner: owner("Alex Morgan") },
        ],
      },
      {
        id: "sc-corporate-customer",
        key: "customer",
        owner: owner("Priya Nair"),
        score: 78,
        kpis: [
          { id: "kpi-corp-cust-1", name: "Net Promoter Score", status: "on-track", owner: owner("Priya Nair") },
          { id: "kpi-corp-cust-2", name: "Customer Retention Rate", status: "on-track", owner: owner("Priya Nair") },
        ],
      },
      {
        id: "sc-corporate-internal-process",
        key: "internal-process",
        owner: owner("Tom Reilly"),
        score: 74,
        kpis: [
          { id: "kpi-corp-proc-1", name: "Process Cycle Time", status: "at-risk", owner: owner("Tom Reilly") },
          { id: "kpi-corp-proc-2", name: "Quality Index", status: "on-track", owner: owner("Tom Reilly") },
        ],
      },
      {
        id: "sc-corporate-learning-growth",
        key: "learning-growth",
        owner: owner("Jamie Park"),
        score: 88,
        kpis: [
          { id: "kpi-corp-learn-1", name: "Employee Engagement", status: "on-track", owner: owner("Jamie Park") },
          { id: "kpi-corp-learn-2", name: "Training Completion Rate", status: "on-track", owner: owner("Jamie Park") },
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
    perspectives: [
      {
        id: "sc-sales-financial",
        key: "financial",
        owner: owner("Jamie Park"),
        score: 80,
        kpis: [
          { id: "kpi-sales-fin-1", name: "Pipeline Coverage Ratio", status: "on-track", owner: owner("Jamie Park") },
          { id: "kpi-sales-fin-2", name: "Win Rate", status: "on-track", owner: owner("Dana Cole") },
        ],
      },
      {
        id: "sc-sales-customer",
        key: "customer",
        owner: owner("Dana Cole"),
        score: 72,
        kpis: [{ id: "kpi-sales-cust-1", name: "Sales-Qualified Lead Conversion", status: "at-risk", owner: owner("Dana Cole") }],
      },
      {
        id: "sc-sales-internal-process",
        key: "internal-process",
        owner: owner("Jamie Park"),
        score: 70,
        kpis: [{ id: "kpi-sales-proc-1", name: "Deal Cycle Time", status: "on-track", owner: owner("Jamie Park") }],
      },
      {
        id: "sc-sales-learning-growth",
        key: "learning-growth",
        owner: owner("Dana Cole"),
        score: 81,
        kpis: [{ id: "kpi-sales-learn-1", name: "Sales Certification Rate", status: "on-track", owner: owner("Dana Cole") }],
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
    perspectives: [
      {
        id: "sc-marketing-financial",
        key: "financial",
        owner: owner("Priya Nair"),
        score: 58,
        kpis: [{ id: "kpi-mktg-fin-1", name: "Marketing ROI", status: "at-risk", owner: owner("Priya Nair") }],
      },
      {
        id: "sc-marketing-customer",
        key: "customer",
        owner: owner("Priya Nair"),
        score: 65,
        kpis: [
          { id: "kpi-mktg-cust-1", name: "Brand Awareness Index", status: "on-track", owner: owner("Priya Nair") },
          { id: "kpi-mktg-cust-2", name: "Lead Conversion Rate", status: "at-risk", owner: owner("Priya Nair") },
        ],
      },
      {
        id: "sc-marketing-internal-process",
        key: "internal-process",
        owner: owner("Tom Reilly"),
        score: 60,
        kpis: [{ id: "kpi-mktg-proc-1", name: "Campaign Launch Cycle Time", status: "at-risk", owner: owner("Tom Reilly") }],
      },
      {
        id: "sc-marketing-learning-growth",
        key: "learning-growth",
        owner: owner("Priya Nair"),
        score: 66,
        kpis: [{ id: "kpi-mktg-learn-1", name: "Team Skills Coverage", status: "on-track", owner: owner("Priya Nair") }],
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
        kpis: [],
      },
      {
        id: "sc-operations-customer",
        key: "customer",
        owner: owner("Tom Reilly"),
        score: 0,
        kpis: [],
      },
      {
        id: "sc-operations-internal-process",
        key: "internal-process",
        owner: owner("Tom Reilly"),
        score: 0,
        kpis: [{ id: "kpi-ops-proc-1", name: "Supply Chain Reliability", status: "draft", owner: owner("Tom Reilly") }],
      },
      {
        id: "sc-operations-learning-growth",
        key: "learning-growth",
        owner: owner("Tom Reilly"),
        score: 0,
        kpis: [],
      },
    ],
  },
];
