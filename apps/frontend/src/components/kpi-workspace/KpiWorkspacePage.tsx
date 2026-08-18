"use client";

import { useState } from "react";
import { Rocket, Target, ClipboardList, SlidersHorizontal } from "lucide-react";
import KpiDetailView from "@/components/kpi-detail/KpiDetailView";
import CaptureTaskList from "@/components/capture/CaptureTaskList";
import CaptureSessionView from "@/components/capture/CaptureSessionView";
import { OkrRegistryPanel } from "@/components/kpi-registry/RegistryPanels";
import { RuleBuilderPanel } from "@/components/rule-builder/RuleBuilderPanel";
import KpiLibraryTable, { KpiStatusBadge, KpiLibraryActions } from "@/components/kpi-workspace/KpiLibraryTable";
import { kpiStatusCounts } from "@/data/mockKpiLibrary";

type TopTab = "okr" | "library" | "rules" | "capture";

type View =
  | { type: "okr" }
  | { type: "library" }
  | { type: "rules" }
  | { type: "detail"; kpiId: string }
  | { type: "capture-list" }
  | { type: "capture-session"; taskId: string };

export default function KpiWorkspacePage() {
  const [view, setView] = useState<View>({ type: "library" });

  // which top-level tab reads as "active" even while drilled into a definition/detail/session view
  const activeTab: TopTab =
    view.type === "detail" ? "library"
      : view.type === "capture-session" ? "capture"
      : view.type === "capture-list" ? "capture"
      : view.type;

  const isTopLevel = view.type === "okr" || view.type === "library" || view.type === "rules" || view.type === "capture-list";

  return (
    <div className="mx-auto max-w-[1500px]">
      {isTopLevel && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <TabButton active={activeTab === "okr"} icon={Rocket} label="OKR Library" onClick={() => setView({ type: "okr" })} />
            <TabButton active={activeTab === "library"} icon={Target} label="KPI Library" onClick={() => setView({ type: "library" })} />
            <TabButton active={activeTab === "rules"} icon={SlidersHorizontal} label="Rule Builder" onClick={() => setView({ type: "rules" })} />
            <TabButton active={activeTab === "capture"} icon={ClipboardList} label="Data Capture" onClick={() => setView({ type: "capture-list" })} />
            {activeTab === "library" && (
              <>
                <KpiStatusBadge label="On Track" count={kpiStatusCounts["on-track"]} tone="on-track" />
                <KpiStatusBadge label="At Risk" count={kpiStatusCounts["at-risk"]} tone="at-risk" />
                <KpiStatusBadge label="Behind" count={kpiStatusCounts.behind} tone="behind" />
              </>
            )}
          </div>
          {activeTab === "library" && <KpiLibraryActions />}
        </div>
      )}

      {view.type === "okr" && <OkrRegistryPanel />}

      {view.type === "library" && (
        <KpiLibraryTable onSelectKpi={(kpiId) => setView({ type: "detail", kpiId })} />
      )}

      {view.type === "rules" && <RuleBuilderPanel />}

      {view.type === "detail" && (
        <KpiDetailView
          kpiId={view.kpiId}
          onBack={() => setView({ type: "library" })}
          onNavigateKpi={(kpiId) => setView({ type: "detail", kpiId })}
          onEditDefinition={() => setView({ type: "library" })}
        />
      )}

      {view.type === "capture-list" && (
        <CaptureTaskList onSelectTask={(taskId) => setView({ type: "capture-session", taskId })} />
      )}

      {view.type === "capture-session" && (
        <CaptureSessionView taskId={view.taskId} onBack={() => setView({ type: "capture-list" })} />
      )}
    </div>
  );
}

function TabButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Rocket; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition ${active ? "border-blue-600 bg-blue-600 font-semibold text-white" : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50"}`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
