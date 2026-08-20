export type SuggestionType = "okr" | "kpi";

export interface KpiSuggestion {
  id: string;
  type: SuggestionType;
  theme: string;
  perspective: "Financial" | "Customer" | "Internal" | "Learning";
  title: string;
  description: string;
  confidence: number;
  unit: string;
  freq: "weekly" | "monthly" | "quarterly";
}

export const THEME_COLORS: Record<string, { badge: string; accent: string }> = {
  "Revenue & Growth": { badge: "bg-blue-600", accent: "bg-blue-600 hover:bg-blue-700" },
  "Customer Experience": { badge: "bg-emerald-500", accent: "bg-emerald-500 hover:bg-emerald-600" },
  "Engineering Excellence": { badge: "bg-indigo-600", accent: "bg-indigo-600 hover:bg-indigo-700" },
  "People & Culture": { badge: "bg-rose-500", accent: "bg-rose-500 hover:bg-rose-600" },
};

export const kpiSuggestions: KpiSuggestion[] = [
  {
    id: "sug-ltv-cac",
    type: "kpi",
    theme: "Revenue & Growth",
    perspective: "Financial",
    title: "LTV:CAC Ratio",
    description: "Tracks the efficiency of customer acquisition relative to long-term value. Current CAC of $5,200 with LTV data missing is a strategic blind spot.",
    confidence: 91,
    unit: "x",
    freq: "quarterly",
  },
  {
    id: "sug-expansion-arr",
    type: "kpi",
    theme: "Revenue & Growth",
    perspective: "Financial",
    title: "Expansion ARR ($M)",
    description: "Net revenue retention is driven largely by expansion. This KPI is currently unmeasured despite being a top growth lever.",
    confidence: 88,
    unit: "$M",
    freq: "monthly",
  },
  {
    id: "sug-ttfv",
    type: "kpi",
    theme: "Customer Experience",
    perspective: "Customer",
    title: "Time to First Value (days)",
    description: "Enterprise onboarding speed directly correlates with retention. Tracking TTFV would expose where churn risk originates.",
    confidence: 84,
    unit: "days",
    freq: "monthly",
  },
  {
    id: "sug-mttr",
    type: "kpi",
    theme: "Engineering Excellence",
    perspective: "Internal",
    title: "Mean Time to Recovery (hrs)",
    description: "Incident response time is untracked despite recent production outages. MTTR would surface reliability gaps before they hit customers.",
    confidence: 79,
    unit: "hrs",
    freq: "weekly",
  },
  {
    id: "sug-nrr-okr",
    type: "okr",
    theme: "Revenue & Growth",
    perspective: "Financial",
    title: "Grow net revenue retention to 115%",
    description: "Expansion and reduced churn together suggest 115% NRR is achievable within two quarters, ahead of the current 108% trajectory.",
    confidence: 86,
    unit: "%",
    freq: "quarterly",
  },
  {
    id: "sug-csat-okr",
    type: "okr",
    theme: "Customer Experience",
    perspective: "Customer",
    title: "Lift enterprise CSAT above 4.6",
    description: "CSAT has drifted down for three straight periods. An explicit objective would focus onboarding and support investments.",
    confidence: 81,
    unit: "score",
    freq: "quarterly",
  },
  {
    id: "sug-deploy-freq",
    type: "kpi",
    theme: "Engineering Excellence",
    perspective: "Internal",
    title: "Change Failure Rate (%)",
    description: "Deployment frequency is climbing but failure rate isn't tracked, masking whether velocity is coming at the cost of stability.",
    confidence: 75,
    unit: "%",
    freq: "weekly",
  },
  {
    id: "sug-enps-okr",
    type: "okr",
    theme: "People & Culture",
    perspective: "Learning",
    title: "Raise engineering eNPS to 65",
    description: "Attrition risk signals in recent surveys point to engineering satisfaction as a leading indicator worth setting a target against.",
    confidence: 72,
    unit: "score",
    freq: "quarterly",
  },
];
