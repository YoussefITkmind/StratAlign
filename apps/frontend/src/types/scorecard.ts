export type ScorecardStatus = "on-track" | "at-risk" | "draft";
export type ObjectiveStatus = "on-track" | "at-risk" | "off-track" | "not-started";

export type PerspectiveKey = "financial" | "customer" | "internal-process" | "learning-growth";

export interface Owner {
  initials: string;
  color: string;
}

export interface ScorecardObjective {
  id: string;
  name: string;
  status: ObjectiveStatus;
  progress: number;
  ownerName: string;
  ownerInitials: string;
  ownerColor: string;
  description?: string;
  linkedKpiIds: string[];
  linkedKpis: string[];
}

export interface Kpi {
  id: string;
  name: string;
  status: ScorecardStatus;
  owner: Owner;
  score: number;
  priorScore?: number;
  /** Share of the parent perspective's weight this KPI carries, e.g. 40 for 40%. Detail-page table only. */
  weight?: number;
  /** Formatted actual/target/variance for the detail-page table, e.g. "38%", "40%", "-2%". */
  actual?: string;
  target?: string;
  variance?: string;
  /** Recent period values for the detail-page trend sparkline, oldest first. */
  trend?: number[];
  /** Shared objective records this KPI is linked to. */
  linkedObjectiveIds?: string[];
}

export interface Perspective {
  id: string;
  key: PerspectiveKey;
  owner: Owner;
  score: number;
  weight: number;
  priorScore?: number;
  objectives?: ScorecardObjective[];
  kpis: Kpi[];
}

export interface Scorecard {
  id: string;
  name: string;
  department: string;
  period: string;
  ownerName: string;
  status: ScorecardStatus;
  score: number;
  priorScore?: number;
  mapId?: string;
  perspectives: Perspective[];
  description?: string;
  reviewFrequency?: string;
  startDate?: string;
  endDate?: string;
  strategyName?: string;
  strategicTheme?: string;
  strategicObjective?: string;
  primaryPerspective?: PerspectiveKey | "all";
  strategicWeight?: number;
  tags?: string[];
  notes?: string;
}

export interface Filters {
  search: string;
  department: string;
  status: ScorecardStatus | "all";
}
