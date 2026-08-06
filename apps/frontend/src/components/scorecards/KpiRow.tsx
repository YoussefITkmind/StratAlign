import Link from "next/link";
import { ChevronRight, Target } from "lucide-react";
import { Kpi } from "@/types/scorecard";
import { KPI_STATUS_DOT } from "@/lib/scorecardConfig";

export default function KpiRow({ kpi }: { kpi: Kpi }) {
  return (
    <Link
      href={`/kpis-okrs/${kpi.id}`}
      className="flex h-11 items-center justify-between border-b border-gray-50 pl-4 pr-4 last:border-b-0 hover:bg-gray-50"
    >
      <div className="flex items-center gap-2.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${KPI_STATUS_DOT[kpi.status]}`} />
        <Target className="h-3.5 w-3.5 shrink-0 text-sky-400" />
        <span className="truncate text-sm text-gray-800">{kpi.name}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ${kpi.owner.color}`}>
          {kpi.owner.initials}
        </span>
        <ChevronRight className="h-4 w-4 text-gray-300" />
      </div>
    </Link>
  );
}
