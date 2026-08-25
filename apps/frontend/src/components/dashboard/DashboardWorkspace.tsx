"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import CustomView from "./CustomView";
import DashboardsHeader, { type ViewMode } from "./DashboardsHeader";
import PortfolioView from "./PortfolioView";
import { savedDashboards } from "@/lib/dashboard/data";

export default function DashboardWorkspace() {
  const [view, setView] = useState<ViewMode>("custom");
  const [search, setSearch] = useState("");
  const [dashboardCount, setDashboardCount] = useState(savedDashboards.length);

  function handleExport() {
    const label = view === "custom" ? "dashboards" : "portfolio initiatives";
    window.alert(`Exporting ${label} as CSV… check your downloads shortly.`);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-[#f7f8fa] shadow-sm">
      <DashboardsHeader
        view={view}
        onViewChange={(nextView) => {
          setView(nextView);
          if (nextView === "custom") setSearch("");
        }}
        count={dashboardCount}
        onExport={handleExport}
      />

      {view === "portfolio" && (
        <div className="px-6 pb-4">
          <label className="relative block max-w-sm">
            <span className="sr-only">Search portfolio initiatives</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search portfolio initiatives..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
            />
          </label>
        </div>
      )}

      {view === "custom" ? (
        <CustomView onCountChange={setDashboardCount} />
      ) : (
        <PortfolioView search={search} />
      )}
    </section>
  );
}
