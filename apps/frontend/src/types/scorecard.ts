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
  score: number;
  priorScore?: number;
}

export interface Perspective {
  id: string;
  key: PerspectiveKey;
  owner: Owner;
  score: number;
  weight: number;
  priorScore?: number;
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
  /** Id of the StrategyMap (see @/data/mockMapData) rendered by this screen's map toggle, if one has been linked. */
  mapId?: string;
  perspectives: Perspective[];
}

export interface Filters {
  search: string;
  department: string;
  status: ScorecardStatus | "all";
}
