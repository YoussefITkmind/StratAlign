"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { Perspective } from "@/types/scorecard";
import { PERSPECTIVE_CONFIG } from "@/lib/scorecardConfig";
import KpiRow from "./KpiRow";

interface Props {
  perspective: Perspective;
  expanded: boolean;
  onToggle: () => void;
}

export default function PerspectiveRow({ perspective, expanded, onToggle }: Props) {
  const cfg = PERSPECTIVE_CONFIG[perspective.key];
  const Icon = cfg.icon;

  return (
    <div>
      <button onClick={onToggle} className="flex w-full flex-col gap-1.5 border-b border-gray-50 py-2.5 pl-8 pr-4 text-left hover:bg-gray-50 sm:pl-10 md:h-12 md:flex-row md:items-center md:justify-between md:py-0">
        <div className="flex min-w-0 items-center gap-2.5">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}>
            <Icon className={`h-3.5 w-3.5 ${cfg.text}`} />
          </span>
          <span className="truncate text-sm font-semibold text-gray-800">{cfg.label}</span>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 md:shrink-0">
          <span className="shrink-0 text-right text-xs text-gray-400 md:w-14">{perspective.kpis.length} KPIs</span>
          <div className="flex min-w-0 flex-1 items-center gap-2 md:w-24 md:flex-none md:justify-end">
            <div className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-gray-100 sm:w-16 md:w-14">
              <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${perspective.score}%` }} />
            </div>
            <span className={`shrink-0 text-right text-sm font-medium ${cfg.text}`}>{perspective.score}%</span>
          </div>
          <div className="flex w-9 shrink-0 items-center justify-center">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ${perspective.owner.color}`}>
              {perspective.owner.initials}
            </span>
          </div>
        </div>
      </button>

      {expanded && perspective.kpis.length > 0 && (
        <div className="ml-[52px] border-l border-gray-100">
          {perspective.kpis.map((k) => (
            <KpiRow key={k.id} kpi={k} />
          ))}
        </div>
      )}
    </div>
  );
}
