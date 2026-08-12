import {
  Banknote,
  ClipboardList,
  FileWarning,
  ShieldAlert,
  Target,
  type LucideIcon,
} from "lucide-react";
import type {
  ApprovalCategory,
  ApprovalPriority,
  ApprovalStatus,
  ComplianceStatus,
  RiskSeverity,
  RiskStatus,
} from "@/types/governance";

export const APPROVAL_CATEGORY_CONFIG: Record<
  ApprovalCategory,
  { label: string; bg: string; text: string; icon: LucideIcon }
> = {
  KPI: { label: "KPI", bg: "bg-blue-50", text: "text-blue-700", icon: Target },
  Budget: { label: "Budget", bg: "bg-emerald-50", text: "text-emerald-700", icon: Banknote },
  Risk: { label: "Risk", bg: "bg-rose-50", text: "text-rose-700", icon: ShieldAlert },
  Policy: { label: "Policy", bg: "bg-violet-50", text: "text-violet-700", icon: FileWarning },
  Strategy: { label: "Strategy", bg: "bg-indigo-50", text: "text-indigo-700", icon: ClipboardList },
};

export const APPROVAL_STATUS_CONFIG: Record<
  ApprovalStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  pending: { label: "Pending Review", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  escalated: { label: "Escalated", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  approved: { label: "Approved", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  rejected: { label: "Rejected", bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" },
};

export const APPROVAL_PRIORITY_CONFIG: Record<ApprovalPriority, { label: string; bg: string; text: string } | null> = {
  urgent: { label: "Urgent", bg: "bg-red-50", text: "text-red-600" },
  normal: null,
};

export const RISK_SEVERITY_CONFIG: Record<RiskSeverity, { label: string; bg: string; text: string; bar: string }> = {
  critical: { label: "Critical", bg: "bg-red-50", text: "text-red-700", bar: "bg-red-500" },
  high: { label: "High", bg: "bg-orange-50", text: "text-orange-700", bar: "bg-orange-500" },
  medium: { label: "Medium", bg: "bg-amber-50", text: "text-amber-700", bar: "bg-amber-500" },
  low: { label: "Low", bg: "bg-slate-100", text: "text-slate-600", bar: "bg-slate-400" },
};

export const RISK_STATUS_CONFIG: Record<RiskStatus, { label: string; bg: string; text: string }> = {
  open: { label: "Open", bg: "bg-red-50", text: "text-red-700" },
  mitigating: { label: "Mitigating", bg: "bg-amber-50", text: "text-amber-700" },
  accepted: { label: "Accepted", bg: "bg-blue-50", text: "text-blue-700" },
  closed: { label: "Closed", bg: "bg-gray-100", text: "text-gray-600" },
};

export const COMPLIANCE_STATUS_CONFIG: Record<ComplianceStatus, { label: string; bg: string; text: string; dot: string }> = {
  compliant: { label: "Compliant", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  "at-risk": { label: "At Risk", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  "non-compliant": { label: "Non-Compliant", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
};

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function isOverdue(dueDateIso: string, nowIso: string): boolean {
  return dueDateIso < nowIso;
}

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-600",
  "bg-indigo-500",
  "bg-teal-600",
];

export function colorForInitials(initials: string): string {
  let hash = 0;
  for (let i = 0; i < initials.length; i++) {
    hash = initials.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
