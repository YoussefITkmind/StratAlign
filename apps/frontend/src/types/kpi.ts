export type PerspectiveKey = "financial" | "customer" | "internal-process" | "learning-growth";

export type KpiStatus = "on-track" | "at-risk" | "behind";

export type ApprovalState = "draft" | "pending" | "approved";

export type Unit = "percent" | "currency" | "number" | "score" | "days";

export type Direction = "higher-better" | "lower-better";

export type Frequency = "weekly" | "monthly" | "quarterly";

export type VersionChangeType = "created" | "definition" | "threshold" | "alignment" | "retired" | "reactivated";

export interface Owner {
  initials: string;
  name: string;
  color: string;
}

export interface BilingualText {
  en: string;
  ar: string;
}

export interface VersionEntry {
  id: string;
  version: number;
  editedBy: string;
  editedAt: string;
  changeType: VersionChangeType;
  summary: string;
}

export interface Comment {
  id: string;
  author: Owner;
  text: BilingualText;
  createdAt: string;
}

export interface HistoryPoint {
  period: string;
  date: string;
  value: number;
}

export interface Kpi {
  id: string;
  name: string;
  tag: string;
  perspective: PerspectiveKey;
  department: string;
  owner: Owner;
  unit: Unit;
  direction: Direction;
  actual: number;
  target: number;
  baseline: number;
  frequency: Frequency;
  approval: ApprovalState;
  status: KpiStatus;
  ruleId: string;
  history: HistoryPoint[];
  comments: Comment[];
  title: BilingualText;
  description: BilingualText;
  domain: string;
  source: string;
  usageCount: number;
  alignedNodeIds: string[];
  retired: boolean;
  retiredNote?: string;
  versions: VersionEntry[];
  childIds?: string[];
  stewardUserId?: string;
  rollupMethod?: RollupMethod;
}

export type RuleComparator = ">=" | ">" | "<=" | "<";

export interface ThresholdBand {
  id: string;
  label: string;
  comparator: RuleComparator;
  value: number;
  status: KpiStatus;
}

export type RollupMethod = "sum" | "average" | "weighted" | "worst-of";

export interface RuleDefinition {
  id: string;
  kpiId: string;
  direction: Direction;
  bands: ThresholdBand[];
  rollup?: RollupMethod;
  active: boolean;
  version: number;
}

export interface CadenceTask {
  id: string;
  kpiId: string;
  period: string;
  dueDate: string;
  state: "not-started" | "draft" | "submitted";
}
