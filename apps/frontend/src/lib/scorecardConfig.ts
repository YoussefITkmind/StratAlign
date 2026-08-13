import { DollarSign, Users, Cog, GraduationCap, type LucideIcon } from "lucide-react";
import { PerspectiveKey, ScorecardStatus } from "@/types/scorecard";

export const SCORECARD_STATUS_CONFIG: Record<
  ScorecardStatus,
  { label: string; badgeBg: string; badgeText: string }
> = {
  "on-track": { label: "On Track", badgeBg: "bg-emerald-50", badgeText: "text-emerald-700" },
  "at-risk": { label: "At Risk", badgeBg: "bg-amber-50", badgeText: "text-amber-700" },
  draft: { label: "Draft", badgeBg: "bg-gray-100", badgeText: "text-gray-600" },
};

export const KPI_STATUS_DOT: Record<ScorecardStatus, string> = {
  "on-track": "bg-emerald-500",
  "at-risk": "bg-amber-500",
  draft: "bg-gray-300",
};

export function scoreColor(score: number): { bar: string; text: string } {
  if (score >= 75) return { bar: "bg-emerald-500", text: "text-emerald-600" };
  if (score >= 50) return { bar: "bg-amber-500", text: "text-amber-600" };
  return { bar: "bg-red-500", text: "text-red-600" };
}

// Suggested starting weights shown in the "New Scorecard" creation form before
// any real scorecard.weighting.propose/publish workflow has run for it. Once
// a scorecard has a published WeightingVersion, its real weights (Prompt 3.1)
// are used instead — see MasterScorecardPage, which reads those, not this.
export const DEFAULT_PERSPECTIVE_WEIGHTS: Record<PerspectiveKey, number> = {
  financial: 30,
  customer: 25,
  "internal-process": 25,
  "learning-growth": 20,
};

export const PERSPECTIVE_CONFIG: Record<
  PerspectiveKey,
  { label: string; icon: LucideIcon; bg: string; text: string; bar: string }
> = {
  financial: { label: "Financial", icon: DollarSign, bg: "bg-emerald-50", text: "text-emerald-600", bar: "bg-emerald-500" },
  customer: { label: "Customer", icon: Users, bg: "bg-blue-50", text: "text-blue-600", bar: "bg-blue-500" },
  "internal-process": { label: "Internal Process", icon: Cog, bg: "bg-violet-50", text: "text-violet-600", bar: "bg-violet-500" },
  "learning-growth": { label: "Learning & Growth", icon: GraduationCap, bg: "bg-amber-50", text: "text-amber-600", bar: "bg-amber-500" },
};

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-600",
  "bg-indigo-500",
];

export function colorForInitials(initials: string): string {
  let hash = 0;
  for (let i = 0; i < initials.length; i++) {
    hash = initials.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
