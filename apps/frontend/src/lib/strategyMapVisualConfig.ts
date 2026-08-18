export type PlacementStatus = "on_track" | "watch" | "off_track";
export type LinkStrength = "weak" | "strong";

interface PerspectiveColors {
  accent: string;
  bandBg: string;
  barColor: string;
  textColor: string;
}

// Perspectives are dynamic per scorecard (not a fixed BSC 4-key enum), so the
// palette cycles by lane index instead of being keyed by name.
const PERSPECTIVE_PALETTE: PerspectiveColors[] = [
  { accent: "#3b82f6", bandBg: "#eef4fd", barColor: "#3b82f6", textColor: "#2563eb" },
  { accent: "#10b981", bandBg: "#eaf7f1", barColor: "#10b981", textColor: "#059669" },
  { accent: "#f59e0b", bandBg: "#faf3e8", barColor: "#f59e0b", textColor: "#d97706" },
  { accent: "#8b5cf6", bandBg: "#f2eefb", barColor: "#8b5cf6", textColor: "#7c3aed" },
  { accent: "#ec4899", bandBg: "#fdf0f6", barColor: "#ec4899", textColor: "#db2777" },
  { accent: "#14b8a6", bandBg: "#ecfaf8", barColor: "#14b8a6", textColor: "#0d9488" },
];

export function perspectiveColors(laneIndex: number): PerspectiveColors {
  return PERSPECTIVE_PALETTE[laneIndex % PERSPECTIVE_PALETTE.length];
}

export const STATUS_DOT: Record<PlacementStatus, string> = {
  on_track: "#10b981",
  watch: "#f59e0b",
  off_track: "#ef4444",
};

export const STATUS_LABEL: Record<PlacementStatus, string> = {
  on_track: "On Track",
  watch: "Watch",
  off_track: "Off Track",
};

export const LINK_CONFIG: Record<LinkStrength, { color: string; width: number }> = {
  weak: { color: "#94a3b8", width: 1.5 },
  strong: { color: "#3b82f6", width: 2.5 },
};

// Canvas layout
export const LANE_HEIGHT = 190;
export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 96;
export const COLUMN_WIDTH = 280;
export const COLUMN_START_X = 40;
export const LANE_LABEL_WIDTH = 40;
