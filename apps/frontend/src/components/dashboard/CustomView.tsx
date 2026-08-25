"use client";

import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { templates as initialTemplates, savedDashboards as initialSaved } from "@/lib/dashboard/data";
import { DashboardTemplate, SavedDashboard } from "@/lib/dashboard/types";
import TemplateCard from "./TemplateCard";
import SavedDashboardCard from "./SavedDashboardCard";
import NewDashboardModal from "./NewDashboardModal";

export default function CustomView({
  onCountChange,
}: {
  onCountChange: (count: number) => void;
}) {
  const [dashboards, setDashboards] = useState<SavedDashboard[]>(initialSaved);
  const [savedSearch, setSavedSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDefault, setModalDefault] = useState("");
  const [activeDashboard, setActiveDashboard] = useState<SavedDashboard | null>(null);

  const accentPalette = ["#0f2f4f", "#2f6fed", "#1fa971", "#7c5cff", "#f59e0b"];

  const filteredDashboards = useMemo(
    () =>
      dashboards.filter((d) =>
        d.name.toLowerCase().includes(savedSearch.trim().toLowerCase())
      ),
    [dashboards, savedSearch]
  );

  function openNewDashboardModal(template?: DashboardTemplate) {
    setModalDefault(template ? `${template.name} copy` : "");
    setModalOpen(true);
  }

  function handleCreate(name: string) {
    const accent = accentPalette[dashboards.length % accentPalette.length];
    const newDashboard: SavedDashboard = {
      id: `${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
      name,
      subtitle: "0 widgets · Just now",
      description: "New dashboard — add widgets to get started.",
      tags: [],
      widgetCount: 0,
      date: "Just now",
      shared: false,
      updatedAt: "Just now",
      accent,
    };
    const updated = [newDashboard, ...dashboards];
    setDashboards(updated);
    onCountChange(updated.length);
    setModalOpen(false);
  }

  return (
    <div className="px-6 pb-16">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wider text-slate-400">
          START FROM A TEMPLATE
        </h2>
        <button
          onClick={() => openNewDashboardModal()}
          className="flex items-center gap-1.5 rounded-lg bg-[#0f2f4f] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#0c2740]"
        >
          <Plus className="h-4 w-4" />
          New Dashboard
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {initialTemplates.map((template) => (
          <TemplateCard key={template.id} template={template} onUse={openNewDashboardModal} />
        ))}
      </div>

      <div className="mt-9 flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wider text-slate-400">
          SAVED DASHBOARDS
        </h2>
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={savedSearch}
            onChange={(e) => setSavedSearch(e.target.value)}
            placeholder="Search..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
          />
        </div>
      </div>

      {filteredDashboards.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-600">No dashboards match “{savedSearch}”</p>
          <p className="mt-1 text-sm text-slate-400">Try a different search or create a new dashboard.</p>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDashboards.map((dashboard) => (
            <SavedDashboardCard
              key={dashboard.id}
              dashboard={dashboard}
              onOpen={setActiveDashboard}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <NewDashboardModal
          defaultName={modalDefault}
          onClose={() => setModalOpen(false)}
          onCreate={handleCreate}
        />
      )}

      {activeDashboard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setActiveDashboard(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-fade-in w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold text-slate-800">{activeDashboard.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{activeDashboard.subtitle}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 rounded-lg"
                  style={{ background: `${activeDashboard.accent}14` }}
                />
              ))}
            </div>
            <button
              onClick={() => setActiveDashboard(null)}
              className="mt-5 w-full rounded-lg bg-[#0f2f4f] px-3 py-2 text-sm font-medium text-white hover:bg-[#0c2740]"
            >
              Close preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
