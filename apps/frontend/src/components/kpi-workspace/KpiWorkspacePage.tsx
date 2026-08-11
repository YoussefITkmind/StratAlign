"use client";

import { useState } from "react";
import { ChevronRight, Rocket, Target, ClipboardList } from "lucide-react";
import KpiLibraryPage from "@/components/kpi-library/KpiLibraryPage";
import KpiDefinitionPage from "@/components/kpi-definition/KpiDefinitionPage";
import KpiDetailView from "@/components/kpi-detail/KpiDetailView";
import CaptureTaskList from "@/components/capture/CaptureTaskList";
import CaptureSessionView from "@/components/capture/CaptureSessionView";
import OkrLibraryPlaceholder from "./OkrLibraryPlaceholder";

type TopTab = "okr" | "library" | "capture";

type View =
  | { type: "okr" }
  | { type: "library" }
  | { type: "definition"; kpiId: string }
  | { type: "detail"; kpiId: string }
  | { type: "capture-list" }
  | { type: "capture-session"; taskId: string };

export default function KpiWorkspacePage() {
  const [view, setView] = useState<View>({ type: "library" });

  // which top-level tab reads as "active" even while drilled into a definition/detail/session view
  const activeTab: TopTab =
    view.type === "definition" || view.type === "detail" ? "library"
      : view.type === "capture-session" ? "capture"
      : view.type === "capture-list" ? "capture"
      : view.type;

  const isTopLevel = view.type === "okr" || view.type === "library" || view.type === "capture-list";

  return (
    <div className="mx-auto max-w-[1500px] p-6">
      <div className="mb-4 flex items-center gap-1.5 text-sm text-gray-500">
        <span>Home</span><ChevronRight className="h-3.5 w-3.5" /><span>Execution</span><ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900">KPIs &amp; OKRs</span>
      </div>

      {isTopLevel && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <TabButton active={activeTab === "okr"} icon={Rocket} label="OKR Library" onClick={() => setView({ type: "okr" })} />
          <TabButton active={activeTab === "library"} icon={Target} label="KPI Library" onClick={() => setView({ type: "library" })} />
          <TabButton active={activeTab === "capture"} icon={ClipboardList} label="Data Capture" onClick={() => setView({ type: "capture-list" })} />
        </div>
      )}

      {view.type === "okr" && <OkrLibraryPlaceholder />}

      {view.type === "library" && (
        <KpiLibraryPage
          onSelectKpi={(kpiId) => setView({ type: "detail", kpiId })}
          onEditKpi={(kpiId) => setView({ type: "definition", kpiId })}
        />
      )}

      {view.type === "definition" && (
        <KpiDefinitionPage
          kpiId={view.kpiId}
          onBack={() => setView({ type: "library" })}
          onViewDetail={(kpiId) => setView({ type: "detail", kpiId })}
        />
      )}

      {view.type === "detail" && (
        <KpiDetailView
          kpiId={view.kpiId}
          onBack={() => setView({ type: "library" })}
          onNavigateKpi={(kpiId) => setView({ type: "detail", kpiId })}
          onEditDefinition={(kpiId) => setView({ type: "definition", kpiId })}
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
      className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium ${active ? "bg-slate-900 text-white" : "border border-gray-300 text-gray-500 hover:bg-gray-50"}`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
