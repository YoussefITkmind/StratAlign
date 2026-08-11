"use client";

import { useState } from "react";
import { ArrowLeft, Archive, Eye } from "lucide-react";
import { PERSPECTIVE_CONFIG, STATUS_CONFIG, APPROVAL_CONFIG } from "@/lib/kpiConfig";
import { useKpiStore } from "@/components/providers/KpiStoreProvider";
import DefinitionTab from "./DefinitionTab";
import AlignmentTab from "./AlignmentTab";
import TargetsTabPlaceholder from "./TargetsTabPlaceholder";
import HistoryTab from "./HistoryTab";
import RetireModal from "./RetireModal";
import ThresholdsTab from "@/components/rule-builder/ThresholdsTab";

type Tab = "definition" | "alignment" | "thresholds" | "targets" | "history";
const TABS: { key: Tab; label: string }[] = [
  { key: "definition", label: "Definition" },
  { key: "alignment", label: "Alignment" },
  { key: "thresholds", label: "Thresholds & Status" },
  { key: "targets", label: "Targets" },
  { key: "history", label: "History" },
];

interface Props {
  kpiId: string;
  onBack: () => void;
  onViewDetail: (kpiId: string) => void;
}

export default function KpiDefinitionPage({ kpiId, onBack, onViewDetail }: Props) {
  const { kpis, rules, retireKpi } = useKpiStore();
  const [tab, setTab] = useState<Tab>("definition");
  const [retireOpen, setRetireOpen] = useState(false);

  const kpi = kpis.find((k) => k.id === kpiId);
  if (!kpi) {
    return (
      <div className="p-10 text-center">
        <p className="text-sm text-gray-500">This KPI couldn&apos;t be found.</p>
        <button onClick={onBack} className="mt-3 text-sm font-medium text-blue-600">← Back to KPI Library</button>
      </div>
    );
  }

  const rule = rules[kpi.ruleId];
  const dependents = kpis.filter((k) => k.childIds?.includes(kpi.id));
  const perspectiveCfg = PERSPECTIVE_CONFIG[kpi.perspective];
  const statusCfg = STATUS_CONFIG[kpi.status];
  const approvalCfg = APPROVAL_CONFIG[kpi.approval];
  const PIcon = perspectiveCfg.icon;

  const confirmRetire = (note: string) => {
    retireKpi(kpi.id, note);
    setRetireOpen(false);
  };

  return (
    <div className="mx-auto max-w-[1000px]">
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to KPI Library
      </button>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{kpi.name}</h1>
            {kpi.retired && <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500"><Archive className="h-3 w-3" /> Retired</span>}
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusCfg.badgeBg} ${statusCfg.badgeText}`}>{statusCfg.label}</span>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${approvalCfg.border} ${approvalCfg.bg} ${approvalCfg.text}`}>{approvalCfg.label}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-gray-500">
            <span className={`flex items-center gap-1.5 font-medium ${perspectiveCfg.text}`}><PIcon className="h-3.5 w-3.5" /> {perspectiveCfg.label}</span>
            <span>·</span><span>{kpi.domain}</span><span>·</span><span>{kpi.department}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => onViewDetail(kpi.id)} className="flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            <Eye className="h-3.5 w-3.5" /> View Performance
          </button>
          {!kpi.retired && (
            <button onClick={() => setRetireOpen(true)} className="flex items-center gap-1.5 rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
              <Archive className="h-3.5 w-3.5" /> Retire
            </button>
          )}
        </div>
      </div>

      <div className="mb-5 flex items-center gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 border-b-2 px-2 pb-3 text-sm font-medium ${tab === t.key ? "border-slate-900 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-600"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "definition" && <DefinitionTab kpi={kpi} />}
      {tab === "alignment" && <AlignmentTab kpi={kpi} />}
      {tab === "thresholds" && rule && <ThresholdsTab kpi={kpi} rule={rule} />}
      {tab === "targets" && <TargetsTabPlaceholder />}
      {tab === "history" && <HistoryTab kpi={kpi} />}

      {retireOpen && <RetireModal kpi={kpi} dependents={dependents} onClose={() => setRetireOpen(false)} onConfirm={confirmRetire} />}
    </div>
  );
}
