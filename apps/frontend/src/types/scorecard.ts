export type ScorecardStatus = "on-track" | "at-risk" | "draft";

export type PerspectiveKey = "financial" | "customer" | "internal-process" | "learning-growth";

export interface Owner {
  initials: string;
  color: string;
}

export interface Kpi {
  id: string;
  name: string;
  status: ScorecardStatus;
  owner: Owner;
}

export interface Perspective {
  id: string;
  key: PerspectiveKey;
  owner: Owner;
  score: number;
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
  perspectives: Perspective[];
}

export interface Filters {
  search: string;
  department: string;
  status: ScorecardStatus | "all";
}
