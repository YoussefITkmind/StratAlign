export type KpiPerspective = "financial" | "customer" | "internal" | "learning";
export type KpiApproval = "draft" | "pending" | "approved";
export type KpiStatus = "on-track" | "at-risk" | "behind";

export interface WorkspaceOwner {
  initials: string;
  name: string;
  color: string;
}

export interface KpiLibraryRow {
  id: string;
  versionId: string;
  name: string;
  tag: string;
  perspective: KpiPerspective;
  department: string;
  owner: WorkspaceOwner;
  actual: string;
  target: string;
  variance: string;
  favorable: boolean;
  trend: number[];
  freq: "Monthly" | "Quarterly";
  approval: KpiApproval;
  status: KpiStatus;
  description?: string;
  unit: string;
  polarity: "higher_is_better" | "lower_is_better";
  dataSourceType: "manual" | "feed";
  period?: string;
  alignedObjectiveId?: string;
}

export interface KeyResultRow {
  id: string;
  label: string;
  actual: string;
  target: string;
  progress: number;
  owner: WorkspaceOwner;
  status: KpiStatus;
  updatedAt: string;
  unit: string;
}

export interface OkrLibraryRow {
  id: string;
  objectiveNodeId: string;
  title: string;
  department: string;
  quarter: string;
  owner: WorkspaceOwner;
  status: KpiStatus;
  progress: number;
  keyResults: KeyResultRow[];
}

export interface ObjectiveOption {
  id: string;
  name: string;
  department: string;
  perspective: KpiPerspective;
  period: string;
  owner: WorkspaceOwner;
}

export interface KpiOkrWorkspaceData {
  kpis: KpiLibraryRow[];
  okrs: OkrLibraryRow[];
  objectives: ObjectiveOption[];
}
