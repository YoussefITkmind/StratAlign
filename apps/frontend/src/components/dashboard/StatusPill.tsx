import { InitiativeStatus } from "@/lib/dashboard/types";

const STYLES: Record<InitiativeStatus, string> = {
  "In Progress": "bg-blue-50 text-blue-600",
  Behind: "bg-red-50 text-red-600",
  Draft: "bg-slate-100 text-slate-500",
  "On Track": "bg-emerald-50 text-emerald-600",
  Complete: "bg-emerald-50 text-emerald-600",
};

const DOT: Record<InitiativeStatus, string> = {
  "In Progress": "bg-blue-500",
  Behind: "bg-red-500",
  Draft: "bg-slate-400",
  "On Track": "bg-emerald-500",
  Complete: "bg-emerald-500",
};

export default function StatusPill({ status }: { status: InitiativeStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} />
      {status}
    </span>
  );
}
