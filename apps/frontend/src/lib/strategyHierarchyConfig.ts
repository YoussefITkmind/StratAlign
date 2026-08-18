import { Building2, Flag, Target, Layers, FolderKanban, Compass, type LucideIcon } from "lucide-react";
import { RAG_STATUS_TOKENS, type RagStatus } from "@/lib/theme/ragStatus";

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

export const STATE_CONFIG: Record<NodeState, { label: string; dot: string; badgeBg: string; badgeText: string; barColor: string }> = {
  draft: { label: "Draft", dot: "bg-gray-400", badgeBg: "bg-gray-100", badgeText: "text-gray-600", barColor: "bg-gray-400" },
  active: { label: "Active", dot: "bg-emerald-500", badgeBg: "bg-emerald-50", badgeText: "text-emerald-700", barColor: "bg-emerald-500" },
  retired: { label: "Retired", dot: "bg-red-400", badgeBg: "bg-red-50", badgeText: "text-red-600", barColor: "bg-red-400" },
};

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash;
}

/**
 * The real strategy node has no owner/progress fields — these are decorative
 * placeholders (deterministic per node id) matching the designed layout until
 * the backend exposes real ownership and rollup progress. The RAG dot next to
 * the avatar already encodes health, so every owner avatar shares one brand color.
 */
export function placeholderOwner(nameEn: string): { initials: string; color: string } {
  const words = nameEn.trim().split(/\s+/).filter(Boolean);
  const initials = ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase() || "—";
  return { initials, color: "bg-indigo-600" };
}

export function placeholderProgress(id: string): number {
  return 40 + (hashSeed(id) % 56);
}

/** Progress rollup health band — on track at 70%+, watch below that, off track under 40%. */
export function progressRagStatus(progress: number): RagStatus {
  if (progress >= 70) return "on_track";
  if (progress >= 40) return "watch";
  return "off_track";
}

export function progressRagTokens(progress: number) {
  return RAG_STATUS_TOKENS[progressRagStatus(progress)];
}
