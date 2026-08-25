import { Activity, Layers, Target, TrendingUp, Users, Zap, type LucideIcon } from "lucide-react";

export type PlacementStatus = "on_track" | "watch" | "off_track";
export type LinkStrength = "weak" | "strong" | "enables" | "impacts" | "drives" | "supports";

interface PerspectiveColors {
  accent: string;
  bandBg: string;
  barColor: string;
  textColor: string;
}

const PERSPECTIVE_PALETTE: PerspectiveColors[] = [
  { accent: "#3b82f6", bandBg: "#eef4fd", barColor: "#3b82f6", textColor: "#2563eb" },
  { accent: "#10b981", bandBg: "#eaf7f1", barColor: "#10b981", textColor: "#059669" },
  { accent: "#f59e0b", bandBg: "#faf3e8", barColor: "#f59e0b", textColor: "#d97706" },
  { accent: "#8b5cf6", bandBg: "#f2eefb", barColor: "#8b5cf6", textColor: "#7c3aed" },
  { accent: "#ec4899", bandBg: "#fdf0f6", barColor: "#ec4899", textColor: "#db2777" },
  { accent: "#14b8a6", bandBg: "#ecfaf8", barColor: "#14b8a6", textColor: "#0d9488" },
];

const PERSPECTIVE_ICONS: LucideIcon[] = [TrendingUp, Users, Activity, Zap, Target, Layers];

export function perspectiveColors(laneIndex: number): PerspectiveColors {
  return PERSPECTIVE_PALETTE[laneIndex % PERSPECTIVE_PALETTE.length];
}

export function perspectiveIcon(laneIndex: number): LucideIcon {
  return PERSPECTIVE_ICONS[laneIndex % PERSPECTIVE_ICONS.length];
}

export const STATUS_DOT: Record<PlacementStatus, string> = {
  on_track: "#10b981",
  watch: "#f59e0b",
  off_track: "#ef4444",
};

export const STATUS_LABEL: Record<PlacementStatus, string> = {
  on_track: "On Track",
  watch: "At Risk",
  off_track: "Off Track",
};

export const STATUS_PILL: Record<PlacementStatus, { bg: string; text: string }> = {
  on_track: { bg: "#eaf7f1", text: "#059669" },
  watch: { bg: "#fdf3e7", text: "#d97706" },
  off_track: { bg: "#fdecec", text: "#dc2626" },
};

export const LINK_CONFIG: Record<LinkStrength, { label: string; color: string; width: number; dashed?: boolean }> = {
  weak: { label: "Weak", color: "#94a3b8", width: 1.5 },
  strong: { label: "Strong", color: "#3b82f6", width: 2.5 },
  enables: { label: "Enables", color: "#0ea5e9", width: 2 },
  impacts: { label: "Impacts", color: "#10b981", width: 2 },
  drives: { label: "Drives", color: "#f97316", width: 2 },
  supports: { label: "Supports", color: "#6366f1", width: 2, dashed: true },
};

export const SEMANTIC_LINK_TYPES: LinkStrength[] = ["enables", "impacts", "drives", "supports"];

// Canvas layout
export const LANE_HEIGHT = 190;
export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 96;
export const COLUMN_WIDTH = 280;
export const COLUMN_START_X = 40;
export const LANE_LABEL_WIDTH = 40;
