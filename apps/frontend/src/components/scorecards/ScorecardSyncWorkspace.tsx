"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Map, Pencil, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import type { Kpi, Perspective, Scorecard, ScorecardObjective } from "@/types/scorecard";
import ScorecardObjectiveModal from "./ScorecardObjectiveModal";
import ScorecardKpiModal from "./ScorecardKpiModal";

function toScorecard(row: unknown): Scorecard | null {
  if (typeof row !== "object" || row === null) return null;
  const record = row as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string" || !Array.isArray(record.perspectives)) return null;
  return record as unknown as Scorecard;
}

export default function ScorecardSyncWorkspace({ scorecardId }: { scorecardId: string }) {
  const utils = trpc.useUtils();
  const listQuery = trpc.scorecard.balanced.list.useQuery();
  const createObjective = trpc.scorecardSync.objective.create.useMutation();
  const updateObjective = trpc.scorecardSync.objective.update.useMutation();
  const deleteObjective = trpc.scorecardSync.objective.delete.useMutation();
  const createKpi = trpc.scorecardSync.kpi.create.useMutation();
  const updateKpi = trpc.scorecardSync.kpi.update.useMutation();
  const deleteKpi = trpc.scorecardSync.kpi.delete.useMutation();

  const scorecard = useMemo(
    () => (listQuery.data ?? []).map(toScorecard).find((row): row is Scorecard => Boolean(row && row.id === scorecardId)),
    [listQuery.data, scorecardId],
  );
  const [open, setOpen] = useState(true);
  const [objectiveEditor, setObjectiveEditor] = useState<{ perspectiveId: string; objective?: ScorecardObjective } | null>(null);
  const [kpiEditor, setKpiEditor] = useState<{ perspective: Perspective; kpi?: Kpi } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = createObjective.isPending || updateObjective.isPending || deleteObjective.isPending || createKpi.isPending || updateKpi.isPending || deleteKpi.isPending;

  const refresh = async () => {
    await Promise.all([
      utils.scorecard.balanced.list.invalidate(),
      utils.scorecard.placement.list.invalidate({ scorecardId }),
      utils.scorecard.get.invalidate({ scorecardId }),
    ]);
  };

  if (listQuery.isLoading || !scorecard) return null;

  const saveObjective = async (input: {
    perspectiveId: string;
    name: string;
    status: "on-track" | "at-risk" | "off-track" | "not-started";
    progress: number;
    ownerName: string;
    description: string | null;
    kpiSnapshotIds?: string[];
  }) => {
    setError(null); setNotice(null);
    try {
      if (objectiveEditor?.objective) {
        await updateObjective.mutateAsync({ scorecardId, objectiveNodeId: objectiveEditor.objective.id, ...input });
        setNotice("Objective updated. The Strategy Map now uses the same record.");
      } else {
        await createObjective.mutateAsync({ scorecardId, ...input });
        setNotice("Objective created and added to the Strategy Map.");
      }
      setObjectiveEditor(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save objective");
    }
  };

  const removeObjective = async (objective: ScorecardObjective) => {
    if (!window.confirm(`Delete objective “${objective.name}” from this scorecard and its Strategy Map?`)) return;
    setError(null); setNotice(null);
    try {
      await deleteObjective.mutateAsync({ scorecardId, objectiveNodeId: objective.id });
      setNotice("Objective and its map connections were removed.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete objective");
    }
  };

  const saveKpi = async (input: {
    name: string;
    status: "on-track" | "at-risk" | "draft";
    ownerInitials: string;
    ownerColor: string;
    score: number;
    weight?: number;
    actual?: string;
    target?: string;
    variance?: string;
    objectiveNodeIds: string[];
  }) => {
    if (!kpiEditor) return;
    setError(null); setNotice(null);
    try {
      if (kpiEditor.kpi) {
        await updateKpi.mutateAsync({ scorecardId, perspectiveId: kpiEditor.perspective.id, kpiSnapshotId: kpiEditor.kpi.id, ...input });
        setNotice("KPI updated; linked objective status/progress was refreshed.");
      } else {
        await createKpi.mutateAsync({ scorecardId, perspectiveId: kpiEditor.perspective.id, ...input });
        setNotice("KPI created and linked to the selected objectives.");
      }
      setKpiEditor(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save KPI");
    }
  };

  const removeKpi = async (perspective: Perspective, kpi: Kpi) => {
    if (!window.confirm(`Delete KPI “${kpi.name}”?`)) return;
    setError(null); setNotice(null);
    try {
      await deleteKpi.mutateAsync({ scorecardId, kpiSnapshotId: kpi.id });
      setNotice("KPI deleted; linked objectives were refreshed.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete KPI");
    }
  };

  return (
    <section className="mx-auto mt-5 max-w-[1600px] px-3 sm:px-5" data-testid="scorecard-sync-workspace">
      <div className="overflow-hidden rounded-xl border border-sky-200 bg-white">
        <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 bg-sky-50 px-4 py-3 text-left">
          <div className="flex items-center gap-2">
            <Map className="h-4 w-4 text-sky-600" />
            <div>
              <p className="text-sm font-semibold text-gray-900">Objectives & Strategy Map</p>
              <p className="text-xs text-gray-500">Objectives and KPI links here are the same records shown on this scorecard’s Strategy Map.</p>
            </div>
          </div>
          {open ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
        </button>

        {open && (
          <div className="p-4">
            {notice && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
            {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="grid gap-4 xl:grid-cols-2">
              {scorecard.perspectives.map((perspective) => (
                <article key={perspective.id} className="rounded-xl border border-gray-200 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{perspective.key === "internal-process" ? "Internal Process" : perspective.key === "learning-growth" ? "Learning & Growth" : perspective.key[0]!.toUpperCase() + perspective.key.slice(1)}</h3>
                      <p className="text-xs text-gray-400">{perspective.objectives?.length ?? 0} objectives · {perspective.kpis.length} KPIs</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button type="button" disabled={busy} onClick={() => setObjectiveEditor({ perspectiveId: perspective.id })} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"><Plus className="h-3 w-3" /> Objective</button>
                      <button type="button" disabled={busy} onClick={() => setKpiEditor({ perspective })} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"><Plus className="h-3 w-3" /> KPI</button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {(perspective.objectives ?? []).map((objective) => (
                      <div key={objective.id} className="rounded-lg bg-gray-50 px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-900">{objective.name}</p>
                            <p className="mt-0.5 text-xs text-gray-500">{objective.status.replace(/-/g, " ")} · {objective.progress}% · {objective.ownerName}</p>
                            {objective.linkedKpis.length > 0 && <p className="mt-1 truncate text-xs text-sky-600">KPIs: {objective.linkedKpis.join(", ")}</p>}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button type="button" onClick={() => setObjectiveEditor({ perspectiveId: perspective.id, objective })} className="rounded p-1.5 text-gray-400 hover:bg-white hover:text-gray-700"><Pencil className="h-3.5 w-3.5" /></button>
                            <button type="button" onClick={() => void removeObjective(objective)} className="rounded p-1.5 text-gray-400 hover:bg-white hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {(perspective.objectives ?? []).length === 0 && <p className="rounded-lg border border-dashed border-gray-200 px-3 py-3 text-xs text-gray-400">No objectives yet. Add one here and it will appear on the Strategy Map.</p>}
                  </div>

                  {perspective.kpis.length > 0 && (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">KPIs</p>
                      <div className="space-y-1">
                        {perspective.kpis.map((kpi) => (
                          <div key={kpi.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                            <div className="min-w-0"><p className="truncate text-xs font-medium text-gray-700">{kpi.name}</p><p className="text-[11px] text-gray-400">{kpi.score}% · {kpi.linkedObjectiveIds?.length ?? 0} linked objectives</p></div>
                            <div className="flex shrink-0 gap-1">
                              <button type="button" onClick={() => setKpiEditor({ perspective, kpi })} className="rounded p-1 text-gray-400 hover:text-gray-700"><Pencil className="h-3 w-3" /></button>
                              <button type="button" onClick={() => void removeKpi(perspective, kpi)} className="rounded p-1 text-gray-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
      </div>

      {objectiveEditor && <ScorecardObjectiveModal objective={objectiveEditor.objective} perspectives={scorecard.perspectives} defaultPerspectiveId={objectiveEditor.perspectiveId} defaultOwnerName={scorecard.ownerName} busy={busy} onClose={() => setObjectiveEditor(null)} onSave={saveObjective} />}
      {kpiEditor && <ScorecardKpiModal kpi={kpiEditor.kpi} perspective={kpiEditor.perspective} busy={busy} onClose={() => setKpiEditor(null)} onSave={saveKpi} />}
    </section>
  );
}
