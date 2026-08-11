import { ChevronRight, Workflow } from "lucide-react";
import { Kpi } from "@/types/kpi";
import { STATUS_CONFIG, formatValue } from "@/lib/kpiConfig";

export default function ContributorTree({ kpi, contributors, onNavigate }: { kpi: Kpi; contributors: Kpi[]; onNavigate: (kpiId: string) => void }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Workflow className="h-4 w-4 text-gray-400" /> Contributor Roll-up
        {kpi.rollupMethod && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium capitalize text-gray-500">{kpi.rollupMethod.replace("-", " ")}</span>}
      </h2>
      <div className="space-y-2">
        {contributors.map((child) => {
          const statusCfg = STATUS_CONFIG[child.status];
          return (
            <button
              key={child.id}
              onClick={() => onNavigate(child.id)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2.5 text-left hover:bg-gray-50"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${statusCfg.dot}`} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{child.name}</p>
                  <p className="text-xs text-gray-400">{child.department}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-semibold text-gray-700">{formatValue(child.actual, child.unit)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusCfg.badgeBg} ${statusCfg.badgeText}`}>{statusCfg.label}</span>
                <ChevronRight className="h-4 w-4 text-gray-300" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
