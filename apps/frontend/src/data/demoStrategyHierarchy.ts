import type { HierarchyTreeNode } from "@/lib/strategyTreeUtils";

/**
 * Shown when there is no reachable backend (or an empty plan) so the page
 * still renders something resembling the designed layout instead of a blank
 * state — not real persisted data.
 */
export const demoStrategyForest: HierarchyTreeNode[] = [
  {
    id: "demo-plan", type: "corporate_strategy", nameEn: "Acme Corp 2025 Strategic Plan", nameAr: "الخطة الاستراتيجية لشركة أكمي 2025",
    state: "active", owner: { initials: "AM", color: "bg-indigo-600" }, progress: 74,
    children: [
      {
        id: "demo-theme-revenue", type: "theme", nameEn: "Revenue & Growth", nameAr: "الإيرادات والنمو",
        state: "active", owner: { initials: "SC", color: "bg-indigo-600" }, progress: 58,
        children: [
          {
            id: "demo-obj-revenue", type: "objective", nameEn: "Drive Revenue Growth 40% YoY", nameAr: "دفع نمو الإيرادات 40% سنويًا", state: "active", owner: { initials: "SC", color: "bg-indigo-600" }, progress: 67,
            children: [
              { id: "demo-kpi-enterprise", type: "objective", nameEn: "Enterprise Segment Revenue Growth", nameAr: "نمو إيرادات قطاع المؤسسات", state: "active", owner: { initials: "SC", color: "bg-indigo-600" }, progress: 63, children: [] },
              { id: "demo-kpi-smb", type: "objective", nameEn: "SMB Segment Revenue Growth", nameAr: "نمو إيرادات الشركات الصغيرة والمتوسطة", state: "active", owner: { initials: "SC", color: "bg-indigo-600" }, progress: 59, children: [] },
              { id: "demo-kpi-newlogo", type: "objective", nameEn: "New Logo ARR", nameAr: "الإيرادات السنوية من العملاء الجدد", state: "active", owner: { initials: "SC", color: "bg-indigo-600" }, progress: 71, children: [] },
              { id: "demo-kpi-expansion", type: "objective", nameEn: "Expansion Revenue Rate", nameAr: "معدل إيرادات التوسع", state: "active", owner: { initials: "SC", color: "bg-indigo-600" }, progress: 68, children: [] },
              { id: "demo-kpi-nrr", type: "objective", nameEn: "Net Revenue Retention", nameAr: "صافي معدل الاحتفاظ بالإيرادات", state: "active", owner: { initials: "SC", color: "bg-indigo-600" }, progress: 74, children: [] },
            ],
          },
          { id: "demo-obj-margin", type: "objective", nameEn: "Improve Gross Margin to 72%", nameAr: "تحسين هامش الربح الإجمالي إلى 72%", state: "active", owner: { initials: "SC", color: "bg-indigo-600" }, progress: 70, children: [] },
        ],
      },
      {
        id: "demo-theme-customer", type: "theme", nameEn: "Customer Excellence", nameAr: "التميز في خدمة العملاء",
        state: "active", owner: { initials: "MW", color: "bg-indigo-600" }, progress: 74,
        children: [
          { id: "demo-obj-nps", type: "objective", nameEn: "Achieve NPS 70+ Across All Segments", nameAr: "تحقيق مؤشر NPS 70+ عبر جميع الشرائح", state: "active", owner: { initials: "MW", color: "bg-indigo-600" }, progress: 74, children: [] },
          { id: "demo-obj-churn", type: "objective", nameEn: "Reduce Churn to Below 5%", nameAr: "خفض معدل التسرب إلى أقل من 5%", state: "active", owner: { initials: "MW", color: "bg-indigo-600" }, progress: 80, children: [] },
        ],
      },
      {
        id: "demo-theme-engineering", type: "theme", nameEn: "Engineering Excellence", nameAr: "التميز الهندسي",
        state: "active", owner: { initials: "PN", color: "bg-indigo-600" }, progress: 78,
        children: [
          { id: "demo-obj-deploy", type: "strategic_play", nameEn: "Ship Weekly Release Trains", nameAr: "إصدار أسبوعي منتظم", state: "active", owner: { initials: "PN", color: "bg-indigo-600" }, progress: 71, children: [] },
          { id: "demo-obj-uptime", type: "objective", nameEn: "Maintain 99.9% Platform Uptime", nameAr: "الحفاظ على تشغيل المنصة بنسبة 99.9%", state: "draft", owner: { initials: "PN", color: "bg-indigo-600" }, progress: 62, children: [] },
        ],
      },
    ],
  },
];
