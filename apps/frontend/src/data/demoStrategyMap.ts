import type { MapPerspective, MapPlacement, MapLinkRow } from "@/lib/buildStrategyMapFlow";

/**
 * Shown when there is no reachable backend (or no published map yet) so the
 * page still renders something resembling the designed layout instead of a
 * blank state — not real persisted data.
 */
export const DEMO_SCORECARD_ID = "demo";

export const demoScorecard = {
  id: DEMO_SCORECARD_ID,
  nameEn: "Corporate Strategy 2025",
  nameAr: "الاستراتيجية المؤسسية 2025",
  planVersionId: "demo-plan",
};

export const demoPerspectives: MapPerspective[] = [
  { id: "demo-financial", nameEn: "Financial", nameAr: "المالية", order: 0, weight: 35 },
  { id: "demo-customer", nameEn: "Customer", nameAr: "العملاء", order: 1, weight: 25 },
  { id: "demo-internal", nameEn: "Internal Process", nameAr: "العمليات الداخلية", order: 2, weight: 25 },
  { id: "demo-learning", nameEn: "Learning & Growth", nameAr: "التعلم والنمو", order: 3, weight: 15 },
];

export const demoPlacements: MapPlacement[] = [
  { perspectiveId: "demo-financial", objectiveNodeId: "demo-grow-revenue", objectiveNameEn: "Grow Revenue 40% YoY", objectiveNameAr: "نمو الإيرادات 40% سنويًا", kpiNameEn: "Revenue Growth Rate", status: "on_track" },
  { perspectiveId: "demo-financial", objectiveNodeId: "demo-improve-profitability", objectiveNameEn: "Improve Profitability", objectiveNameAr: "تحسين الربحية", kpiNameEn: "Net Margin", status: "on_track" },
  { perspectiveId: "demo-financial", objectiveNodeId: "demo-expand-market", objectiveNameEn: "Expand Market Share", objectiveNameAr: "توسيع الحصة السوقية", kpiNameEn: "Market Share", status: "watch" },

  { perspectiveId: "demo-customer", objectiveNodeId: "demo-acquire-logos", objectiveNameEn: "Acquire Enterprise Logos", objectiveNameAr: "استقطاب عملاء المؤسسات", kpiNameEn: "New Enterprise Accounts", status: "watch" },
  { perspectiveId: "demo-customer", objectiveNodeId: "demo-retention", objectiveNameEn: "Drive Customer Retention", objectiveNameAr: "تعزيز الاحتفاظ بالعملاء", kpiNameEn: "Customer Retention Rate", status: "on_track" },
  { perspectiveId: "demo-customer", objectiveNodeId: "demo-premium-experience", objectiveNameEn: "Deliver Premium Experience", objectiveNameAr: "تقديم تجربة متميزة", kpiNameEn: "CSAT Score", status: "on_track" },

  { perspectiveId: "demo-internal", objectiveNodeId: "demo-innovation", objectiveNameEn: "Accelerate Innovation", objectiveNameAr: "تسريع الابتكار", kpiNameEn: "Features Shipped", status: "on_track" },
  { perspectiveId: "demo-internal", objectiveNodeId: "demo-ops-excellence", objectiveNameEn: "Operational Excellence", objectiveNameAr: "التميز التشغيلي", kpiNameEn: "System Uptime", status: "on_track" },
  { perspectiveId: "demo-internal", objectiveNodeId: "demo-sales-excellence", objectiveNameEn: "Sales Excellence", objectiveNameAr: "التميز في المبيعات", kpiNameEn: "Sprint Velocity", status: "watch" },
];

export const demoLinks: MapLinkRow[] = [
  { id: "demo-link-1", fromObjectiveId: "demo-acquire-logos", toObjectiveId: "demo-grow-revenue", strength: "strong" },
  { id: "demo-link-2", fromObjectiveId: "demo-retention", toObjectiveId: "demo-improve-profitability", strength: "strong" },
  { id: "demo-link-3", fromObjectiveId: "demo-premium-experience", toObjectiveId: "demo-expand-market", strength: "weak" },
  { id: "demo-link-4", fromObjectiveId: "demo-innovation", toObjectiveId: "demo-premium-experience", strength: "strong" },
  { id: "demo-link-5", fromObjectiveId: "demo-ops-excellence", toObjectiveId: "demo-retention", strength: "weak" },
  { id: "demo-link-6", fromObjectiveId: "demo-sales-excellence", toObjectiveId: "demo-grow-revenue", strength: "weak" },
];
