"use client";

import { Download, LayoutGrid, PieChart } from "lucide-react";

export type ViewMode = "custom" | "portfolio";

export default function DashboardsHeader({
  view,
  onViewChange,
  count,
  onExport,
}: {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  count: number;
  onExport: () => void;
}) {
  const title = "Dashboards";
  const subtitle =
    view === "custom"
      ? `${count} dashboards · drag-and-drop widget builder`
      : "Portfolio-level execution management view";

  return (
    <div className="flex items-start justify-between px-6 pb-5 pt-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            onClick={() => onViewChange("custom")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              view === "custom"
                ? "bg-white text-slate-800 shadow-sm border border-slate-200"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            Custom
          </button>
          <button
            onClick={() => onViewChange("portfolio")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              view === "portfolio"
                ? "bg-white text-slate-800 shadow-sm border border-slate-200"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <PieChart className="h-4 w-4" />
            Portfolio
          </button>
        </div>

        <button
          onClick={onExport}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          <Download className="h-4 w-4 text-slate-400" />
          Export
        </button>
      </div>
    </div>
  );
}
