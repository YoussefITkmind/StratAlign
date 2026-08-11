import { DollarSign, Users, Cog, GraduationCap, type LucideIcon } from "lucide-react";
import { ApprovalState, KpiStatus, PerspectiveKey, Unit } from "@/types/kpi";

export const PERSPECTIVE_ORDER: PerspectiveKey[] = ["financial", "customer", "internal-process", "learning-growth"];

export const PERSPECTIVE_CONFIG: Record<
  PerspectiveKey,
  { label: string; icon: LucideIcon; bg: string; text: string }
> = {
  financial: { label: "Financial", icon: DollarSign, bg: "bg-emerald-50", text: "text-emerald-600" },
  customer: { label: "Customer", icon: Users, bg: "bg-blue-50", text: "text-blue-600" },
  "internal-process": { label: "Internal Process", icon: Cog, bg: "bg-violet-50", text: "text-violet-600" },
  "learning-growth": { label: "Learning & Growth", icon: GraduationCap, bg: "bg-amber-50", text: "text-amber-600" },
};

export const STATUS_CONFIG: Record<KpiStatus, { label: string; badgeBg: string; badgeText: string; dot: string; hex: string }> = {
  "on-track": { label: "On Track", badgeBg: "bg-emerald-50", badgeText: "text-emerald-700", dot: "bg-emerald-500", hex: "#10b981" },
  "at-risk": { label: "At Risk", badgeBg: "bg-amber-50", badgeText: "text-amber-700", dot: "bg-amber-500", hex: "#f59e0b" },
  behind: { label: "Behind", badgeBg: "bg-red-50", badgeText: "text-red-700", dot: "bg-red-500", hex: "#ef4444" },
};

export const APPROVAL_CONFIG: Record<ApprovalState, { label: string; border: string; bg: string; text: string }> = {
  draft: { label: "Draft", border: "border-gray-200", bg: "bg-gray-50", text: "text-gray-600" },
  pending: { label: "Pending Approval", border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700" },
  approved: { label: "Approved", border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700" },
};

const AVATAR_COLORS = ["bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-cyan-600", "bg-indigo-500"];

export function colorForInitials(initials: string): string {
  let hash = 0;
  for (let i = 0; i < initials.length; i++) {
    hash = initials.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function formatValue(value: number, unit: Unit): string {
  switch (unit) {
    case "percent": return `${value.toFixed(1)}%`;
    case "currency": return `$${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
    case "days": return `${value.toFixed(1)}d`;
    case "score": return value.toFixed(1);
    default: return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }
}

export function formatVariance(actual: number, target: number, unit: Unit): string {
  const diff = actual - target;
  const sign = diff > 0 ? "+" : "";
  return `${sign}${formatValue(diff, unit)}`;
}
