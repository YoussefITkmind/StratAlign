"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Target } from "lucide-react";
import { Kpi } from "@/types/scorecard";
import { KPI_STATUS_DOT } from "@/lib/scorecardConfig";

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) {
    return <span className="text-sm text-gray-400">—</span>;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((value, index) => `${(index / (data.length - 1)) * 100},${24 - ((value - min) / range) * 20}`)
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      className="h-8 w-20 text-sky-500"
      aria-label="KPI trend"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function varianceClass(variance?: string) {
  if (variance?.trim().startsWith("-")) return "text-red-500";
  if (variance?.trim().startsWith("+")) return "text-emerald-600";
  return "text-gray-800";
}

export default function KpiRow({ kpi }: { kpi: Kpi }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-gray-50 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-center justify-between px-4 py-2 text-left hover:bg-gray-50"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${KPI_STATUS_DOT[kpi.status]}`} />
          <Target className="h-3.5 w-3.5 shrink-0 text-sky-400" />
          <span className="truncate text-sm text-gray-800">{kpi.name}</span>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          {(kpi.actual || kpi.target) && (
            <div className="hidden w-24 items-center justify-end gap-2 text-xs md:flex">
              <span className="font-medium text-sky-600">{kpi.actual ?? "—"}</span>
              <span className="text-gray-300">/</span>
              <span className="text-gray-400">{kpi.target ?? "—"}</span>
            </div>
          )}
          <div className="flex w-9 items-center justify-center">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ${kpi.owner.color}`}>
              {kpi.owner.initials}
            </span>
          </div>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-300" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="mx-4 mb-3 rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 sm:px-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
            <div>
              <p className="text-xs text-gray-400">Actual</p>
              <p className="mt-0.5 text-sm font-medium text-gray-900">{kpi.actual ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Target</p>
              <p className="mt-0.5 text-sm font-medium text-gray-900">{kpi.target ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Variance</p>
              <p className={`mt-0.5 text-sm font-medium ${varianceClass(kpi.variance)}`}>{kpi.variance ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Weight</p>
              <p className="mt-0.5 text-sm font-medium text-gray-900">{kpi.weight != null ? `${kpi.weight}%` : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Owner</p>
              <div className="mt-1 flex items-center gap-2">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ${kpi.owner.color}`}>
                  {kpi.owner.initials}
                </span>
                <span className="text-sm font-medium text-gray-900">{kpi.owner.initials}</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400">Trend</p>
              <div className="mt-1">
                <Sparkline data={kpi.trend ?? []} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
