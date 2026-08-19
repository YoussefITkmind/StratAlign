import { Building2, Flag, Target, Layers, FolderKanban, type LucideIcon } from "lucide-react";
import type { NodeType, NodeStatus } from "@/types/strategy";

export const TYPE_CONFIG: Record<NodeType, { label: string; icon: LucideIcon; bg: string; text: string }> = {
  plan: { label: "Plan", icon: Building2, bg: "bg-slate-100", text: "text-slate-700" },
  perspective: { label: "Perspective", icon: Flag, bg: "bg-purple-100", text: "text-purple-600" },
  objective: { label: "Objective", icon: Target, bg: "bg-blue-100", text: "text-blue-600" },
  initiative: { label: "Initiative", icon: Layers, bg: "bg-emerald-100", text: "text-emerald-600" },
  project: { label: "Project", icon: FolderKanban, bg: "bg-amber-100", text: "text-amber-600" },
};

export const STATUS_CONFIG: Record<NodeStatus, { label: string; dot: string; bar: string }> = {
  "on-track": { label: "On track", dot: "bg-emerald-500", bar: "bg-emerald-500" },
  "at-risk": { label: "At risk", dot: "bg-amber-500", bar: "bg-amber-500" },
  "off-track": { label: "Off track", dot: "bg-red-500", bar: "bg-red-500" },
  "not-started": { label: "Not started", dot: "bg-gray-300", bar: "bg-gray-300" },
};

const OWNER_PALETTE = [
  "bg-indigo-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-purple-500",
  "bg-cyan-600",
  "bg-teal-500",
];

/** Deterministic color assignment so the same owner always renders the same avatar color. */
export function colorForInitials(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return OWNER_PALETTE[hash % OWNER_PALETTE.length];
}
