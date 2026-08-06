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
      <button onClick={onToggle} className="flex h-12 w-full items-center justify-between border-b border-gray-50 pl-10 pr-4 text-left hover:bg-gray-50">
        <div className="flex min-w-0 items-center gap-2.5">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}>
            <Icon className={`h-3.5 w-3.5 ${cfg.text}`} />
          </span>
          <span className="truncate text-sm font-semibold text-gray-800">{cfg.label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <span className="w-14 text-right text-xs text-gray-400">{perspective.kpis.length} KPIs</span>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100">
            <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${perspective.score}%` }} />
          </div>
          <span className={`w-9 text-right text-sm font-medium ${cfg.text}`}>{perspective.score}%</span>
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ${perspective.owner.color}`}>
            {perspective.owner.initials}
          </span>
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
