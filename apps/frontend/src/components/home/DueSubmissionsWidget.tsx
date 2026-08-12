"use client";

import type { CadenceTask } from "@/types/kpi";
import { useI18n } from "@/lib/i18n/locale-context";
import { WidgetCard } from "./WidgetCard";

const STATE_CONFIG: Record<CadenceTask["state"], { label: string; bg: string; text: string }> = {
  "not-started": { label: "Not started", bg: "bg-gray-100", text: "text-gray-600" },
  draft: { label: "Draft", bg: "bg-blue-50", text: "text-blue-700" },
  submitted: { label: "Submitted", bg: "bg-emerald-50", text: "text-emerald-700" },
};

// Read once at module load rather than during render — same reasoning as the
// react-hooks/purity rule that flags Date.now() in a component body.
const now = Date.now();

export function DueSubmissionsWidget({
  tasks,
  kpiNameById,
}: {
  tasks: CadenceTask[];
  kpiNameById: Record<string, string>;
}) {
  const { t } = useI18n();

  return (
    <WidgetCard testId="widget-due-submissions" title={t("home.dueSubmissionsTitle")} href="/kpis-okrs" linkLabel={t("home.viewAll")}>
      <div className="flex flex-col divide-y divide-gray-100">
        {tasks.map((task) => {
          const cfg = STATE_CONFIG[task.state];
          const overdue = task.state !== "submitted" && new Date(task.dueDate).getTime() < now;
          return (
            <div key={task.id} data-testid={`due-submission-${task.id}`} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-gray-800">{kpiNameById[task.kpiId] ?? task.kpiId}</p>
                <p className={`mt-0.5 truncate text-xs ${overdue ? "font-medium text-red-600" : "text-gray-400"}`}>
                  {task.period} · {new Date(task.dueDate).toLocaleDateString()}
                  {overdue ? ` · ${t("home.overdue")}` : ""}
                </p>
              </div>
              <span className={`shrink-0 rounded-full ${cfg.bg} ${cfg.text} px-2 py-0.5 text-[11px] font-medium`}>
                {cfg.label}
              </span>
            </div>
          );
        })}
        {tasks.length === 0 && <p className="text-xs text-gray-400">{t("home.noData")}</p>}
      </div>
    </WidgetCard>
  );
}
