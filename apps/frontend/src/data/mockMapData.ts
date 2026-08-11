import { StrategyMap } from "@/types/strategyMap";

export const initialMaps: StrategyMap[] = [
  {
    id: "map-corporate",
    name: "Corporate Strategy",
    period: "FY 2025",
    objectives: [
      { id: "obj-revenue-growth", title: "Grow Revenue 20% YoY", perspective: "financial", owner: "Alex Morgan", score: 78, column: 0 },
      { id: "obj-operating-margin", title: "Improve Operating Margin", perspective: "financial", owner: "Jamie Park", score: 64, column: 1 },
      { id: "obj-cost-efficiency", title: "Reduce Cost to Serve", perspective: "financial", owner: "Alex Morgan", score: 45, column: 2 },

      { id: "obj-customer-satisfaction", title: "Raise CSAT Score", perspective: "customer", owner: "Priya Nair", score: 82, column: 0 },
      { id: "obj-churn-reduction", title: "Reduce Churn Rate", perspective: "customer", owner: "Priya Nair", score: 58, column: 1 },
      { id: "obj-market-expansion", title: "Expand into EMEA", perspective: "customer", owner: "Diego Ramirez", score: 40, column: 2 },

      { id: "obj-process-automation", title: "Automate Core Workflows", perspective: "internal-process", owner: "Sam Whitfield", score: 71, column: 0 },
      { id: "obj-quality-improvement", title: "Improve Delivery Quality", perspective: "internal-process", owner: "Sam Whitfield", score: 66, column: 1 },

      { id: "obj-talent-development", title: "Upskill Engineering Team", perspective: "learning", owner: "Nina Torres", score: 55, column: 0 },
      { id: "obj-culture-engagement", title: "Boost Employee Engagement", perspective: "learning", owner: "Nina Torres", score: 73, column: 1 },
    ],
    dependencies: [
      { id: "dep-1", source: "obj-talent-development", target: "obj-process-automation", type: "enables" },
      { id: "dep-2", source: "obj-culture-engagement", target: "obj-quality-improvement", type: "supports" },
      { id: "dep-3", source: "obj-process-automation", target: "obj-cost-efficiency", type: "drives" },
      { id: "dep-4", source: "obj-quality-improvement", target: "obj-customer-satisfaction", type: "impacts" },
      { id: "dep-5", source: "obj-customer-satisfaction", target: "obj-churn-reduction", type: "enables" },
      { id: "dep-6", source: "obj-churn-reduction", target: "obj-revenue-growth", type: "drives" },
      { id: "dep-7", source: "obj-market-expansion", target: "obj-revenue-growth", type: "impacts" },
      { id: "dep-8", source: "obj-cost-efficiency", target: "obj-operating-margin", type: "drives" },
    ],
  },
  {
    id: "map-emea-expansion",
    name: "EMEA Expansion",
    period: "FY 2025",
    objectives: [
      { id: "obj-emea-revenue", title: "Establish EMEA Revenue Base", perspective: "financial", owner: "Diego Ramirez", score: 32, column: 0 },
      { id: "obj-emea-partners", title: "Sign 5 Regional Partners", perspective: "customer", owner: "Diego Ramirez", score: 50, column: 0 },
      { id: "obj-emea-compliance", title: "Achieve GDPR Compliance", perspective: "internal-process", owner: "Sam Whitfield", score: 68, column: 0 },
      { id: "obj-emea-hiring", title: "Hire Regional Leadership", perspective: "learning", owner: "Nina Torres", score: 44, column: 0 },
    ],
    dependencies: [
      { id: "dep-emea-1", source: "obj-emea-hiring", target: "obj-emea-compliance", type: "enables" },
      { id: "dep-emea-2", source: "obj-emea-compliance", target: "obj-emea-partners", type: "supports" },
      { id: "dep-emea-3", source: "obj-emea-partners", target: "obj-emea-revenue", type: "drives" },
    ],
  },
];
