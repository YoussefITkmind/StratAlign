"use client";

import { ClipboardList, AlertTriangle, ChevronRight } from "lucide-react";
import { CadenceTask } from "@/types/kpi";
import { useKpiStore } from "@/components/providers/KpiStoreProvider";

function isOverdue(dueDate: string): boolean {
  return new Date(dueDate).getTime() < Date.now();
}

const STATE_CONFIG: Record<CadenceTask["state"], { label: string; badgeBg: string; badgeText: string }> = {
  "not-started": { label: "Not Started", badgeBg: "bg-gray-100", badgeText: "text-gray-600" },
  draft: { label: "Draft", badgeBg: "bg-amber-50", badgeText: "text-amber-700" },
  submitted: { label: "Submitted", badgeBg: "bg-emerald-50", badgeText: "text-emerald-700" },
};

export default function CaptureTaskList({ onSelectTask }: { onSelectTask: (taskId: string) => void }) {
  const { cadenceTasks, kpis } = useKpiStore();

  const rows = cadenceTasks
    .map((task) => ({ task, kpi: kpis.find((k) => k.id === task.kpiId) }))
    .filter((r): r is { task: CadenceTask; kpi: NonNullable<typeof r.kpi> } => !!r.kpi);

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
        <ClipboardList className="h-4 w-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-900">My Submission Tasks</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {rows.map(({ task, kpi }) => {
          const stateCfg = STATE_CONFIG[task.state];
          const overdue = task.state !== "submitted" && isOverdue(task.dueDate);
          return (
            <button
              key={task.id}
              onClick={() => onSelectTask(task.id)}
              className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left hover:bg-gray-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{kpi.name}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-400">
                  {task.period} · Due {new Date(task.dueDate).toLocaleDateString()}
                  {overdue && <span className="flex items-center gap-1 text-red-500"><AlertTriangle className="h-3 w-3" /> Overdue</span>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${stateCfg.badgeBg} ${stateCfg.badgeText}`}>{stateCfg.label}</span>
                <ChevronRight className="h-4 w-4 text-gray-300" />
              </div>
            </button>
          );
        })}
        {rows.length === 0 && <p className="px-5 py-10 text-center text-sm text-gray-400">No submission tasks are due right now.</p>}
      </div>
    </div>
  );
}
