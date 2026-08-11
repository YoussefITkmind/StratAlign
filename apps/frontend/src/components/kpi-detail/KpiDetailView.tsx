"use client";

import { ArrowLeft, Pencil } from "lucide-react";
import { Comment } from "@/types/kpi";
import { PERSPECTIVE_CONFIG, STATUS_CONFIG, APPROVAL_CONFIG } from "@/lib/kpiConfig";
import { useKpiStore } from "@/components/providers/KpiStoreProvider";
import HeadlineFigures from "./HeadlineFigures";
import ContributorTree from "./ContributorTree";
import CommentaryPanel from "./CommentaryPanel";
import LinkedInitiativesPanel from "./LinkedInitiativesPanel";
import ThresholdChart from "@/components/shared/ThresholdChart";

interface Props {
  kpiId: string;
  onBack: () => void;
  onNavigateKpi: (kpiId: string) => void;
  onEditDefinition: (kpiId: string) => void;
}

export default function KpiDetailView({ kpiId, onBack, onNavigateKpi, onEditDefinition }: Props) {
  const { kpis, rules, updateKpi } = useKpiStore();

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
  const children = (kpi.childIds ?? []).map((id) => kpis.find((k) => k.id === id)).filter((k): k is NonNullable<typeof k> => !!k);
  const perspectiveCfg = PERSPECTIVE_CONFIG[kpi.perspective];
  const statusCfg = STATUS_CONFIG[kpi.status];
  const approvalCfg = APPROVAL_CONFIG[kpi.approval];
  const PIcon = perspectiveCfg.icon;

  const handleAddComment = (comment: Comment) => {
    updateKpi(kpi.id, { comments: [...kpi.comments, comment] });
  };

  return (
    <div className="mx-auto max-w-[1100px]">
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to KPI Library
      </button>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{kpi.name}</h1>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusCfg.badgeBg} ${statusCfg.badgeText}`}>{statusCfg.label}</span>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${approvalCfg.border} ${approvalCfg.bg} ${approvalCfg.text}`}>{approvalCfg.label}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-gray-500">
            <span className={`flex items-center gap-1.5 font-medium ${perspectiveCfg.text}`}><PIcon className="h-3.5 w-3.5" /> {perspectiveCfg.label}</span>
            <span>·</span>
            <span>{kpi.department}</span>
            <span>·</span>
            <span className="flex items-center gap-1.5">
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white ${kpi.owner.color}`}>{kpi.owner.initials}</span>
              {kpi.owner.name}
            </span>
          </div>
        </div>

        <button onClick={() => onEditDefinition(kpi.id)} className="flex shrink-0 items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          <Pencil className="h-3.5 w-3.5" /> Edit Definition
        </button>
      </div>

      <div className="space-y-5">
        <HeadlineFigures kpi={kpi} />

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Trend vs. Threshold Bands</h2>
          {rule ? <ThresholdChart history={kpi.history} rule={rule} /> : <p className="text-sm text-gray-400">No active rule yet.</p>}
        </div>

        {children.length > 0 && <ContributorTree kpi={kpi} contributors={children} onNavigate={onNavigateKpi} />}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <CommentaryPanel kpi={kpi} onAddComment={handleAddComment} />
          </div>
          <LinkedInitiativesPanel />
        </div>
      </div>
    </div>
  );
}
