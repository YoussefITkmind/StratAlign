export interface AlignmentStrategyNode {
  id: string;
  type: "pillar" | "objective";
  name: string;
  pillarId?: string;
}

export const mockStrategyNodes: AlignmentStrategyNode[] = [
  { id: "pillar-revenue", type: "pillar", name: "Revenue & Growth" },
  { id: "obj-drive-revenue", type: "objective", name: "Drive Revenue Growth 40% YoY", pillarId: "pillar-revenue" },
  { id: "obj-expand-markets", type: "objective", name: "Expand into 3 New Markets", pillarId: "pillar-revenue" },

  { id: "pillar-customer", type: "pillar", name: "Customer Experience" },
  { id: "obj-improve-csat", type: "objective", name: "Improve Customer Satisfaction", pillarId: "pillar-customer" },
  { id: "obj-reduce-churn", type: "objective", name: "Reduce Customer Churn", pillarId: "pillar-customer" },

  { id: "pillar-operations", type: "pillar", name: "Operational Excellence" },
  { id: "obj-streamline-ops", type: "objective", name: "Streamline Core Operations", pillarId: "pillar-operations" },

  { id: "pillar-people", type: "pillar", name: "People & Culture" },
  { id: "obj-employee-engagement", type: "objective", name: "Raise Employee Engagement", pillarId: "pillar-people" },
];
