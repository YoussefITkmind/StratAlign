export type PerspectiveKey = "financial" | "customer" | "internal-process" | "learning";

export type DependencyType = "enables" | "impacts" | "drives" | "supports";

export type StatusFilter = "on-track" | "at-risk" | "off-track";

export interface Objective {
  id: string;
  title: string;
  perspective: PerspectiveKey;
  owner: string;
  score: number;
  column: number;
}

export interface Dependency {
  id: string;
  source: string;
  target: string;
  type: DependencyType;
}

export interface StrategyMap {
  id: string;
  name: string;
  period: string;
  objectives: Objective[];
  dependencies: Dependency[];
}
