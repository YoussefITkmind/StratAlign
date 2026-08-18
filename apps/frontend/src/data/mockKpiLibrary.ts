export type KpiPerspective = "financial" | "customer" | "internal" | "learning";
export type KpiApproval = "draft" | "pending" | "approved";
export type KpiStatus = "on-track" | "at-risk" | "behind";

export interface KpiLibraryRow {
  id: string;
  name: string;
  tag: string;
  perspective: KpiPerspective;
  department: string;
  owner: { initials: string; color: string };
  actual: string;
  target: string;
  variance: string;
  favorable: boolean;
  trend: number[];
  warning?: boolean;
  freq: "Weekly" | "Monthly" | "Quarterly";
  approval: KpiApproval;
  status: KpiStatus;
}

// Explicit literal classes (not a hash-derived lookup) so Tailwind's
// content scanner reliably picks every one of them up at build time.
const OWNER_COLORS: Record<string, string> = {
  MW: "bg-amber-600",
  PN: "bg-cyan-600",
  DF: "bg-emerald-600",
  AM: "bg-blue-600",
  TR: "bg-rose-600",
};

function owner(initials: string) {
  return { initials, color: OWNER_COLORS[initials] ?? "bg-slate-500" };
}

export const kpiLibraryRows: KpiLibraryRow[] = [
  { id: "kpi-annual-churn-rate", name: "Annual Churn Rate", tag: "Retention", perspective: "customer", department: "Customer Success", owner: owner("MW"), actual: "5.5%", target: "5%", variance: "+0.5%", favorable: false, trend: [3, 4, 4.2, 4.8, 5.1, 5.5], freq: "Monthly", approval: "draft", status: "at-risk" },
  { id: "kpi-bug-backlog-reduction", name: "Bug Backlog Reduction", tag: "Quality", perspective: "internal", department: "Engineering", owner: owner("PN"), actual: "43%", target: "60%", variance: "-17%", favorable: false, trend: [65, 58, 52, 48, 45, 43], freq: "Weekly", approval: "approved", status: "behind" },
  { id: "kpi-csat-score", name: "CSAT Score", tag: "Satisfaction", perspective: "customer", department: "Customer Success", owner: owner("MW"), actual: "4.1", target: "4.5", variance: "-0.4", favorable: false, trend: [4.6, 4.5, 4.3, 4.2, 4.1, 4.1], warning: true, freq: "Monthly", approval: "approved", status: "at-risk" },
  { id: "kpi-customer-acquisition-cost", name: "Customer Acquisition Cost", tag: "Efficiency", perspective: "financial", department: "Marketing", owner: owner("MW"), actual: "$5,200", target: "$4,800", variance: "+$400", favorable: false, trend: [4600, 4750, 4900, 5000, 5100, 5200], freq: "Monthly", approval: "pending", status: "at-risk" },
  { id: "kpi-customer-retention-rate", name: "Customer Retention Rate", tag: "Retention", perspective: "customer", department: "Customer Success", owner: owner("MW"), actual: "94.5%", target: "95%", variance: "-0.5%", favorable: false, trend: [92.5, 93, 93.5, 94, 94.2, 94.5], freq: "Monthly", approval: "approved", status: "on-track" },
  { id: "kpi-deployment-frequency", name: "Deployment Frequency (/wk)", tag: "DevOps", perspective: "internal", department: "Engineering", owner: owner("PN"), actual: "8.4", target: "10", variance: "-1.6", favorable: false, trend: [6.5, 7, 7.5, 7.8, 8.1, 8.4], freq: "Weekly", approval: "approved", status: "at-risk" },
  { id: "kpi-employee-enps", name: "Employee eNPS", tag: "Engagement", perspective: "learning", department: "HR", owner: owner("DF"), actual: "54", target: "55", variance: "-1", favorable: false, trend: [48, 50, 51, 52, 53, 54], freq: "Quarterly", approval: "approved", status: "on-track" },
  { id: "kpi-revenue-growth-rate", name: "Revenue Growth Rate", tag: "Growth", perspective: "financial", department: "Finance", owner: owner("AM"), actual: "12.4%", target: "10%", variance: "+2.4%", favorable: true, trend: [8, 9, 10, 11, 11.8, 12.4], freq: "Quarterly", approval: "approved", status: "on-track" },
  { id: "kpi-gross-margin", name: "Gross Margin", tag: "Profitability", perspective: "financial", department: "Finance", owner: owner("AM"), actual: "68%", target: "65%", variance: "+3%", favorable: true, trend: [61, 63, 64, 65, 66, 68], freq: "Monthly", approval: "approved", status: "on-track" },
  { id: "kpi-net-promoter-score", name: "Net Promoter Score", tag: "Satisfaction", perspective: "customer", department: "Customer Success", owner: owner("MW"), actual: "48", target: "45", variance: "+3", favorable: true, trend: [38, 40, 42, 44, 46, 48], freq: "Quarterly", approval: "approved", status: "on-track" },
  { id: "kpi-employee-turnover-rate", name: "Employee Turnover Rate", tag: "Retention", perspective: "learning", department: "HR", owner: owner("DF"), actual: "6.2%", target: "8%", variance: "-1.8%", favorable: true, trend: [9.5, 8.8, 8, 7.4, 6.8, 6.2], freq: "Quarterly", approval: "approved", status: "on-track" },
  { id: "kpi-sprint-velocity", name: "Sprint Velocity", tag: "Delivery", perspective: "internal", department: "Engineering", owner: owner("PN"), actual: "34 pts", target: "42 pts", variance: "-8 pts", favorable: false, trend: [44, 41, 39, 37, 35, 34], freq: "Weekly", approval: "approved", status: "at-risk" },
  { id: "kpi-lead-conversion-rate", name: "Lead Conversion Rate", tag: "Efficiency", perspective: "financial", department: "Marketing", owner: owner("TR"), actual: "3.1%", target: "4%", variance: "-0.9%", favorable: false, trend: [4.3, 4, 3.7, 3.4, 3.2, 3.1], freq: "Monthly", approval: "pending", status: "at-risk" },
  { id: "kpi-support-ticket-resolution-time", name: "Support Ticket Resolution Time (hrs)", tag: "Responsiveness", perspective: "customer", department: "Customer Success", owner: owner("MW"), actual: "18.5", target: "12", variance: "+6.5", favorable: false, trend: [11, 13, 14.5, 16, 17.2, 18.5], freq: "Weekly", approval: "draft", status: "at-risk" },
  { id: "kpi-training-completion-rate", name: "Training Completion Rate", tag: "Development", perspective: "learning", department: "HR", owner: owner("DF"), actual: "71%", target: "90%", variance: "-19%", favorable: false, trend: [88, 84, 80, 76, 73, 71], freq: "Quarterly", approval: "pending", status: "at-risk" },
  { id: "kpi-system-uptime", name: "System Uptime", tag: "Reliability", perspective: "internal", department: "Engineering", owner: owner("PN"), actual: "98.2%", target: "99.9%", variance: "-1.7%", favorable: false, trend: [99.8, 99.5, 99.1, 98.8, 98.5, 98.2], freq: "Monthly", approval: "approved", status: "behind" },
];

export const kpiStatusCounts = kpiLibraryRows.reduce(
  (counts, row) => ({ ...counts, [row.status]: counts[row.status] + 1 }),
  { "on-track": 0, "at-risk": 0, behind: 0 } as Record<KpiStatus, number>,
);
