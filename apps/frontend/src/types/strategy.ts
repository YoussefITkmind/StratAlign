export type NodeType = "plan" | "perspective" | "objective" | "initiative" | "project";

export type NodeStatus = "on-track" | "at-risk" | "off-track" | "not-started";

export interface StrategyNodeOwner {
  initials: string;
  color: string;
}

export interface StrategyNode {
  id: string;
  name: string;
  type: NodeType;
  status: NodeStatus;
  progress: number;
  owner: StrategyNodeOwner;
  children?: StrategyNode[];
}
