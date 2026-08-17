import { Clock } from "lucide-react";
import { CasePriority, CaseStatus, SLAZone } from "@/types/case";
import { RAG_STATUS_TOKENS, RagStatus } from "@/lib/theme/ragStatus";

const PRIORITY_CLASSES: Record<CasePriority, string> = {
  Critical: "bg-red-50 text-red-600 border-red-200",
  High: "bg-amber-50 text-amber-700 border-amber-200",
  Medium: "bg-blue-50 text-blue-600 border-blue-200",
  Low: "bg-gray-100 text-gray-600 border-gray-200",
};

export function PriorityBadge({ priority }: { priority: CasePriority }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${PRIORITY_CLASSES[priority]}`}>
      {priority}
    </span>
  );
}

const STATUS_CLASSES: Record<CaseStatus, string> = {
  Open: "bg-pink-50 text-pink-600 border-pink-200",
  Acknowledged: "bg-blue-50 text-blue-600 border-blue-200",
  Escalated: "bg-indigo-50 text-indigo-600 border-indigo-200",
  "In Review": "bg-amber-50 text-amber-700 border-amber-200",
  Resolved: "bg-emerald-50 text-emerald-600 border-emerald-200",
};

export function StatusBadge({ status }: { status: CaseStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASSES[status]}`}>
      {status}
    </span>
  );
}

// SLA chips reuse the shared RAG tokens (green/amber/red) instead of inventing
// new colors, so time-remaining-vs-deadline reads the same way scorecard/KPI
// status does everywhere else in the app.
const SLA_TO_RAG: Record<SLAZone, RagStatus> = {
  "on-track": "on_track",
  near: "watch",
  overdue: "off_track",
};

export function SLABadge({ zone, label }: { zone: SLAZone; label: string }) {
  const tokens = RAG_STATUS_TOKENS[SLA_TO_RAG[zone]];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${tokens.badgeBg} ${tokens.badgeText}`}>
      <Clock className="h-3 w-3 shrink-0" />
      {label}
    </span>
  );
}
