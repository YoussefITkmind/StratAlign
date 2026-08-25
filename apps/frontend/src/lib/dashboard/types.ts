export type RagStatus = "on-track" | "at-risk" | "off-track" | "draft";

export type InitiativeStatus = "In Progress" | "Behind" | "Draft" | "On Track" | "Complete";

export type Confidence = "High" | "Medium" | "Low";

export interface Owner {
  initials: string;
  name: string;
  color: string;
}

export interface Initiative {
  id: string;
  name: string;
  play: string;
  objective: string;
  status: InitiativeStatus;
  rag: RagStatus;
  stage: string;
  progress: number;
  milestonesDone: number;
  milestonesTotal: number;
  confidence: Confidence;
  owner: Owner;
  /** Committed spend in USD, used by the Spend vs Budget widget. */
  budgetSpend: number;
  /** Total allocated budget in USD, used by the Spend vs Budget widget. */
  budgetTotal: number;
  /** 0-100, how strategically important this initiative is (Prioritization Quadrant Y axis). */
  strategicWeight: number;
  /** 0-100, execution health score (Prioritization Quadrant X axis). */
  healthScore: number;
  /** Accent color used for this initiative's bubble/bar across portfolio widgets. */
  color: string;
}

export interface ThemeGroup {
  id: string;
  name: string;
  color: string;
  atRisk: number;
  behind: number;
  initiatives: Initiative[];
}

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  widgetCount: number;
  icon: "grid" | "trending" | "bolt";
  iconBg: string;
}

export interface SavedDashboard {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  tags: string[];
  widgetCount: number;
  date: string;
  shared: boolean;
  updatedAt: string;
  accent: string;
}
