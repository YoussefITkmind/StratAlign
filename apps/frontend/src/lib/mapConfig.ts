import { PerspectiveKey, DependencyType, StatusFilter } from "@/types/strategyMap";

export const PERSPECTIVE_ORDER: PerspectiveKey[] = ["financial", "customer", "internal-process", "learning"];

export const PERSPECTIVE_CONFIG: Record<
  PerspectiveKey,
  { label: string; weight: number; accent: string; bandBg: string; barColor: string; textColor: string }
> = {
  financial: { label: "Financial", weight: 35, accent: "#3b82f6", bandBg: "#eef4fd", barColor: "#3b82f6", textColor: "#2563eb" },
  customer: { label: "Customer", weight: 25, accent: "#10b981", bandBg: "#eaf7f1", barColor: "#10b981", textColor: "#059669" },
  "internal-process": { label: "Internal Process", weight: 25, accent: "#f59e0b", bandBg: "#faf3e8", barColor: "#f59e0b", textColor: "#d97706" },
  learning: { label: "Learning & Growth", weight: 15, accent: "#8b5cf6", bandBg: "#f2eefb", barColor: "#8b5cf6", textColor: "#7c3aed" },
};

export const DEPENDENCY_ORDER: DependencyType[] = ["enables", "impacts", "drives", "supports"];

export const DEPENDENCY_CONFIG: Record<DependencyType, { label: string; color: string; dashed?: boolean }> = {
  enables: { label: "Enables", color: "#3b82f6" },
  impacts: { label: "Impacts", color: "#10b981" },
  drives: { label: "Drives", color: "#f97316" },
  supports: { label: "Supports", color: "#8b5cf6", dashed: true },
};

export function scoreStatus(score: number): StatusFilter {
  if (score >= 70) return "on-track";
  if (score >= 50) return "at-risk";
  return "off-track";
}

export const STATUS_DOT: Record<StatusFilter, string> = {
  "on-track": "#10b981",
  "at-risk": "#f59e0b",
  "off-track": "#ef4444",
};

export const STATUS_LABEL: Record<StatusFilter, string> = {
  "on-track": "On Track",
  "at-risk": "At Risk",
  "off-track": "Off Track",
};

// Canvas layout
export const LANE_HEIGHT = 190;
export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 96;
export const COLUMN_WIDTH = 280;
export const COLUMN_START_X = 40;
export const LANE_LABEL_WIDTH = 40;
