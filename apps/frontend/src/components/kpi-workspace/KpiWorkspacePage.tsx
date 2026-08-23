"use client";

import { useMemo, useState } from "react";
import { Rocket, Target, ClipboardList, SlidersHorizontal } from "lucide-react";
import CaptureTaskList from "@/components/capture/CaptureTaskList";
import CaptureSessionView from "@/components/capture/CaptureSessionView";
import OkrLibraryTable, { OkrLibraryStats, OkrLibraryActions } from "@/components/kpi-workspace/OkrLibraryTable";
import { RuleBuilderPanel } from "@/components/rule-builder/RuleBuilderPanel";
import KpiLibraryTable, { KpiStatusBadge, KpiLibraryActions } from "@/components/kpi-workspace/KpiLibraryTable";
import { kpiStatusCounts } from "@/data/mockKpiLibrary";
import { trpc } from "@/lib/trpc/client";
import { usePublishAssistantContext } from "@/lib/assistant/assistant-context";

const MAX_ASSISTANT_CONTEXT_ITEMS = 25;

type TopTab = "okr" | "library" | "rules" | "capture";

type View =
  | { type: "okr" }
  | { type: "library" }
  | { type: "rules" }
  | { type: "capture-list" }
  | { type: "capture-session"; taskId: string };

export default function KpiWorkspacePage() {
  const [view, setView] = useState<View>({ type: "library" });

  // Real registry data, fetched independently of the (still mock-backed)
  // library tables below — this, not the demo tables, is what grounds the
  // assistant, so it never presents placeholder rows as genuine KPIs/OKRs.
  const kpiListQuery = trpc.registry.kpi.list.useQuery();
  const okrListQuery = trpc.registry.okr.list.useQuery();
  const assistantData = useMemo(() => {
    if (!kpiListQuery.data && !okrListQuery.data) return null;
    const kpis = kpiListQuery.data ?? [];
    const okrs = okrListQuery.data ?? [];
    return {
      totalKpis: kpis.length,
      activeKpis: kpis.filter((kpi) => kpi.definition.status === "active").length,
      draftKpis: kpis.filter((kpi) => kpi.definition.status === "draft").length,
      kpis: kpis.slice(0, MAX_ASSISTANT_CONTEXT_ITEMS).map((kpi) => ({
        name: kpi.version.nameEn,
        unit: kpi.version.unit,
        polarity: kpi.version.polarity,
        frequency: kpi.version.frequency,
        status: kpi.definition.status,
      })),
      totalOkrs: okrs.length,
      okrs: okrs.slice(0, MAX_ASSISTANT_CONTEXT_ITEMS).map((okr) => ({
        name: okr.nameEn,
        keyResultCount: okr.keyResults.length,
      })),
      keyResults: okrs
        .flatMap((okr) =>
          okr.keyResults.map((keyResult) => ({
            okr: okr.nameEn,
            title: keyResult.titleEn ?? null,
            target: keyResult.targetValue,
            current: keyResult.currentValue,
            progressPercent: keyResult.progressPercent,
            unit: keyResult.unit,
          })),
        )
        .slice(0, MAX_ASSISTANT_CONTEXT_ITEMS),
    };
  }, [kpiListQuery.data, okrListQuery.data]);
  usePublishAssistantContext("kpis_okrs", null, assistantData);

  // which top-level tab reads as "active" even while drilled into a session view
  const activeTab: TopTab =
    view.type === "capture-session" ? "capture"
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
            {activeTab === "okr" && <OkrLibraryStats />}
          </div>
          {activeTab === "library" && <KpiLibraryActions />}
          {activeTab === "okr" && <OkrLibraryActions />}
        </div>
      )}

      {view.type === "okr" && <OkrLibraryTable />}

      {view.type === "library" && <KpiLibraryTable />}

      {view.type === "rules" && <RuleBuilderPanel />}

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
