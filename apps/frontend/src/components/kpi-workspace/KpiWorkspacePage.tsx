"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Download, Rocket, SlidersHorizontal, Sparkles, Target } from "lucide-react";
import CaptureTaskList from "@/components/capture/CaptureTaskList";
import CaptureSessionView from "@/components/capture/CaptureSessionView";
import { RuleBuilderPanel } from "@/components/rule-builder/RuleBuilderPanel";
import PersistedKpiLibraryTable, { KpiStatusBadges } from "@/components/kpi-workspace/PersistedKpiLibraryTable";
import PersistedOkrLibraryTable, { OkrLibraryStats } from "@/components/kpi-workspace/PersistedOkrLibraryTable";
import AiSuggestModal from "./AiSuggestModal";
import { trpc } from "@/lib/trpc/client";
import { usePublishAssistantContext } from "@/lib/assistant/assistant-context";
import type { KpiOkrWorkspaceData } from "@/types/kpi-workspace";

const MAX_ASSISTANT_CONTEXT_ITEMS = 25;
type TopTab = "okr" | "library" | "rules" | "capture";
type View = { type: "okr" } | { type: "library" } | { type: "rules" } | { type: "capture-list" } | { type: "capture-session"; taskId: string };

export default function KpiWorkspacePage() {
  const [view, setView] = useState<View>({ type: "library" });
  const [showAiSuggest, setShowAiSuggest] = useState<"kpi" | "okr" | null>(null);
  const workspaceQuery = trpc.kpiWorkspace.list.useQuery();
  const workspace = (workspaceQuery.data ?? { kpis: [], okrs: [], objectives: [] }) as KpiOkrWorkspaceData;
  const utils = trpc.useUtils();

  const refreshWorkspace = async () => {
    await Promise.all([
      utils.kpiWorkspace.list.invalidate(),
      utils.registry.kpi.list.invalidate(),
      utils.registry.okr.list.invalidate(),
    ]);
  };

  const assistantData = useMemo(() => ({
    totalKpis: workspace.kpis.length,
    activeKpis: workspace.kpis.filter((kpi) => kpi.approval === "approved").length,
    draftKpis: workspace.kpis.filter((kpi) => kpi.approval === "draft").length,
    kpis: workspace.kpis.slice(0, MAX_ASSISTANT_CONTEXT_ITEMS).map((kpi) => ({ name: kpi.name, unit: kpi.unit, polarity: kpi.polarity, frequency: kpi.freq.toLowerCase(), status: kpi.status, actual: kpi.actual, target: kpi.target, department: kpi.department })),
    totalOkrs: workspace.okrs.length,
    okrs: workspace.okrs.slice(0, MAX_ASSISTANT_CONTEXT_ITEMS).map((okr) => ({ name: okr.title, keyResultCount: okr.keyResults.length, progressPercent: okr.progress, department: okr.department })),
    keyResults: workspace.okrs.flatMap((okr) => okr.keyResults.map((kr) => ({ okr: okr.title, title: kr.label, target: kr.target, current: kr.actual, progressPercent: kr.progress }))).slice(0, MAX_ASSISTANT_CONTEXT_ITEMS),
  }), [workspace]);
  usePublishAssistantContext("kpis_okrs", null, assistantData);

  const activeTab: TopTab = view.type === "capture-session" || view.type === "capture-list" ? "capture" : view.type;
  const isTopLevel = view.type !== "capture-session";

  const exportData = () => {
    const rows = activeTab === "okr" ? workspace.okrs : workspace.kpis;
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = activeTab === "okr" ? "okrs.json" : "kpis.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (workspaceQuery.isLoading) return <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">Loading persisted KPI and OKR data…</div>;
  if (workspaceQuery.error) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{workspaceQuery.error.message}</div>;

  return <div className="mx-auto max-w-[1500px]">
    {isTopLevel && <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><TabButton active={activeTab === "okr"} icon={Rocket} label="OKR Library" onClick={() => setView({ type: "okr" })} /><TabButton active={activeTab === "library"} icon={Target} label="KPI Library" onClick={() => setView({ type: "library" })} /><TabButton active={activeTab === "rules"} icon={SlidersHorizontal} label="Rule Builder" onClick={() => setView({ type: "rules" })} /><TabButton active={activeTab === "capture"} icon={ClipboardList} label="Data Capture" onClick={() => setView({ type: "capture-list" })} />{activeTab === "library" && <KpiStatusBadges rows={workspace.kpis} />}{activeTab === "okr" && <OkrLibraryStats rows={workspace.okrs} />}</div>{(activeTab === "library" || activeTab === "okr") && <div className="flex items-center gap-2"><button type="button" onClick={exportData} className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"><Download className="h-4 w-4" /> Export</button><button type="button" onClick={() => setShowAiSuggest(activeTab === "okr" ? "okr" : "kpi")} className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white"><Sparkles className="h-4 w-4" /> AI Suggest</button></div>}</div>}

    {view.type === "okr" && <PersistedOkrLibraryTable rows={workspace.okrs} objectives={workspace.objectives} onRefresh={refreshWorkspace} />}
    {view.type === "library" && <PersistedKpiLibraryTable rows={workspace.kpis} objectives={workspace.objectives} onRefresh={refreshWorkspace} />}
    {view.type === "rules" && <RuleBuilderPanel />}
    {view.type === "capture-list" && <CaptureTaskList onSelectTask={(taskId) => setView({ type: "capture-session", taskId })} />}
    {view.type === "capture-session" && <CaptureSessionView taskId={view.taskId} onBack={() => setView({ type: "capture-list" })} />}
    {showAiSuggest && <AiSuggestModal initialTypeFilter={showAiSuggest} onClose={() => setShowAiSuggest(null)} />}
  </div>;
}

function TabButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Rocket; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition ${active ? "border-blue-600 bg-blue-600 font-semibold text-white" : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50"}`}><Icon className="h-3.5 w-3.5" /> {label}</button>;
}
