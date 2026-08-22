export type NodeType = "plan" | "perspective" | "objective" | "initiative" | "project";

export type NodeStatus = "on-track" | "at-risk" | "off-track" | "not-started";

export interface StrategyNodeOwner {
  initials: string;
  color: string;
  name?: string;
}

export interface StrategyNodeActivity {
  id: string;
  message: string;
  actor: string;
  createdAt: string;
}

export interface StrategyNode {
  id: string;
  parentId?: string | null;
  name: string;
  type: NodeType;
  status: NodeStatus;
  progress: number;
  owner: StrategyNodeOwner;
  children?: StrategyNode[];
  description?: string | null;
  budget?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  linkedKpis?: string[];
  activity?: StrategyNodeActivity[];
}
