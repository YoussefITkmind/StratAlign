import { Building2, Flag, Target, Layers, FolderKanban, Compass, type LucideIcon } from "lucide-react";

export type NodeType = "corporate_strategy" | "theme" | "objective" | "strategic_play" | "portfolio" | "area_of_focus";
export type EdgeType = "contains" | "executed_by" | "belongs_to_portfolio" | "aligns_to";
export type NodeState = "draft" | "active" | "retired";

export const NODE_TYPES: NodeType[] = ["corporate_strategy", "theme", "objective", "strategic_play", "portfolio", "area_of_focus"];

export const TYPE_CONFIG: Record<NodeType, { label: string; icon: LucideIcon; bg: string; text: string }> = {
  corporate_strategy: { label: "Corporate Strategy", icon: Building2, bg: "bg-slate-100", text: "text-slate-700" },
  theme: { label: "Theme", icon: Flag, bg: "bg-purple-100", text: "text-purple-600" },
  objective: { label: "Objective", icon: Target, bg: "bg-blue-100", text: "text-blue-600" },
  strategic_play: { label: "Strategic Play", icon: Layers, bg: "bg-emerald-100", text: "text-emerald-600" },
  portfolio: { label: "Portfolio", icon: FolderKanban, bg: "bg-amber-100", text: "text-amber-600" },
  area_of_focus: { label: "Area of Focus", icon: Compass, bg: "bg-rose-100", text: "text-rose-600" },
};

export const STATE_CONFIG: Record<NodeState, { label: string; dot: string; badgeBg: string; badgeText: string }> = {
  draft: { label: "Draft", dot: "bg-gray-400", badgeBg: "bg-gray-100", badgeText: "text-gray-600" },
  active: { label: "Active", dot: "bg-emerald-500", badgeBg: "bg-emerald-50", badgeText: "text-emerald-700" },
  retired: { label: "Retired", dot: "bg-red-400", badgeBg: "bg-red-50", badgeText: "text-red-600" },
};
