import { Kpi, RuleDefinition } from "@/types/kpi";
import { colorForInitials } from "@/lib/kpiConfig";
import { buildDefaultRule } from "@/lib/ruleEngine";

function owner(name: string) {
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return { initials, name, color: colorForInitials(initials) };
}

function history(values: number[]): Kpi["history"] {
  const now = new Date();
  return values.map((value, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (values.length - 1 - i), 1);
    return { period: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }), date: d.toISOString(), value };
  });
}

function version(id: string, editedBy: string) {
  return [{ id: `${id}-v1`, version: 1, editedBy, editedAt: new Date(Date.now() - 90 * 86400000).toISOString(), changeType: "created" as const, summary: "KPI created." }];
}

const raw: Array<Omit<Kpi, "ruleId"> & { ruleTarget: number }> = [
  {
    id: "kpi-churn", name: "Customer Churn Rate", tag: "Customer Experience", perspective: "customer", department: "Customer Success",
    owner: owner("Jamie Park"), unit: "percent", direction: "lower-better", actual: 4.2, target: 3.5, baseline: 6.0,
    frequency: "monthly", approval: "approved", status: "at-risk", history: history([6.0, 5.4, 5.0, 4.6, 4.4, 4.2]),
    comments: [], title: { en: "Customer Churn Rate", ar: "معدل تسرب العملاء" }, description: { en: "Percentage of customers lost per month.", ar: "" },
    domain: "Customer Experience", source: "CRM", usageCount: 12, alignedNodeIds: ["obj-reduce-churn"], retired: false,
    versions: version("kpi-churn", "Jamie Park"), ruleTarget: 3.5,
  },
  {
    id: "kpi-revenue-growth", name: "YoY Revenue Growth", tag: "Revenue & Growth", perspective: "financial", department: "Finance",
    owner: owner("Sofia Chen"), unit: "percent", direction: "higher-better", actual: 28, target: 40, baseline: 18,
    frequency: "quarterly", approval: "approved", status: "behind", history: history([18, 20, 22, 24, 26, 28]),
    comments: [], title: { en: "YoY Revenue Growth", ar: "" }, description: { en: "Year-over-year revenue growth rate.", ar: "" },
    domain: "Revenue & Growth", source: "Data Warehouse", usageCount: 20, alignedNodeIds: ["obj-drive-revenue"], retired: false,
    versions: version("kpi-revenue-growth", "Sofia Chen"), ruleTarget: 40, childIds: ["kpi-enterprise-sales", "kpi-new-markets"],
  },
  {
    id: "kpi-enterprise-sales", name: "Enterprise Sales Bookings", tag: "Revenue & Growth", perspective: "financial", department: "Sales",
    owner: owner("Tariq Rahman"), unit: "currency", direction: "higher-better", actual: 1450000, target: 1800000, baseline: 900000,
    frequency: "quarterly", approval: "approved", status: "at-risk", history: history([900000, 1050000, 1150000, 1250000, 1380000, 1450000]),
    comments: [], title: { en: "Enterprise Sales Bookings", ar: "" }, description: { en: "New enterprise contract value booked.", ar: "" },
    domain: "Revenue & Growth", source: "CRM", usageCount: 8, alignedNodeIds: ["obj-drive-revenue"], retired: false,
    versions: version("kpi-enterprise-sales", "Tariq Rahman"), ruleTarget: 1800000,
  },
  {
    id: "kpi-new-markets", name: "New Market Entries", tag: "Revenue & Growth", perspective: "financial", department: "Strategy",
    owner: owner("Sofia Chen"), unit: "number", direction: "higher-better", actual: 1, target: 3, baseline: 0,
    frequency: "quarterly", approval: "approved", status: "behind", history: history([0, 0, 1, 1, 1, 1]),
    comments: [], title: { en: "New Market Entries", ar: "" }, description: { en: "Count of new markets entered.", ar: "" },
    domain: "Revenue & Growth", source: "Manual Entry", usageCount: 3, alignedNodeIds: ["obj-expand-markets"], retired: false,
    versions: version("kpi-new-markets", "Sofia Chen"), ruleTarget: 3,
  },
  {
    id: "kpi-csat", name: "Customer Satisfaction Score", tag: "Customer Experience", perspective: "customer", department: "Support",
    owner: owner("Jamie Park"), unit: "score", direction: "higher-better", actual: 4.6, target: 4.5, baseline: 4.1,
    frequency: "monthly", approval: "approved", status: "on-track", history: history([4.1, 4.2, 4.3, 4.4, 4.5, 4.6]),
    comments: [], title: { en: "Customer Satisfaction Score", ar: "" }, description: { en: "Average post-interaction CSAT survey score.", ar: "" },
    domain: "Customer Experience", source: "Survey", usageCount: 15, alignedNodeIds: ["obj-improve-csat"], retired: false,
    versions: version("kpi-csat", "Jamie Park"), ruleTarget: 4.5,
  },
  {
    id: "kpi-aht", name: "Average Handle Time", tag: "Network & Operations", perspective: "internal-process", department: "Support",
    owner: owner("Priya Nair"), unit: "days", direction: "lower-better", actual: 0.3, target: 0.25, baseline: 0.45,
    frequency: "weekly", approval: "draft", status: "at-risk", history: history([0.45, 0.4, 0.38, 0.35, 0.32, 0.3]),
    comments: [], title: { en: "Average Handle Time", ar: "" }, description: { en: "Average time to resolve a support ticket, in days.", ar: "" },
    domain: "Network & Operations", source: "Data Warehouse", usageCount: 5, alignedNodeIds: ["obj-streamline-ops"], retired: false,
    versions: version("kpi-aht", "Priya Nair"), ruleTarget: 0.25,
  },
  {
    id: "kpi-engagement", name: "Employee Engagement Index", tag: "People & Culture", perspective: "learning-growth", department: "People",
    owner: owner("Omar Saleh"), unit: "score", direction: "higher-better", actual: 7.8, target: 8.0, baseline: 7.0,
    frequency: "quarterly", approval: "pending", status: "at-risk", history: history([7.0, 7.2, 7.4, 7.5, 7.7, 7.8]),
    comments: [], title: { en: "Employee Engagement Index", ar: "" }, description: { en: "Composite score from quarterly employee pulse surveys.", ar: "" },
    domain: "People & Culture", source: "Survey", usageCount: 2, alignedNodeIds: ["obj-employee-engagement"], retired: false,
    versions: version("kpi-engagement", "Omar Saleh"), ruleTarget: 8.0,
  },
];

export const initialRules: Record<string, RuleDefinition> = {};
export const initialKpis: Kpi[] = raw.map(({ ruleTarget, ...kpi }) => {
  const rule = buildDefaultRule(kpi.id, ruleTarget, kpi.direction);
  initialRules[rule.id] = rule;
  return { ...kpi, ruleId: rule.id };
});
