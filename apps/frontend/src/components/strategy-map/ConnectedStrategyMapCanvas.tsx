"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Download, ExternalLink, Link2, Map as MapIcon, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import StrategyMapFlowCanvas from "./StrategyMapFlowCanvas";
import DeleteObjectiveModal from "./DeleteObjectiveModal";
import ScorecardObjectiveModal from "@/components/scorecards/ScorecardObjectiveModal";
import type { MapLinkRow, MapPlacement } from "@/lib/buildStrategyMapFlow";
import type { ObjectiveStatus, Perspective, Scorecard, ScorecardObjective } from "@/types/scorecard";
import { getMapAuthorization } from "@/app/(app)/strategy-maps/authorization";
import {
  LINK_CONFIG,
  SEMANTIC_LINK_TYPES,
  STATUS_DOT,
  STATUS_LABEL,
  STATUS_PILL,
  perspectiveColors,
  perspectiveIcon,
  type LinkStrength,
} from "@/lib/strategyMapVisualConfig";

interface ScorecardMapDetail {
  id: string;
  nameEn: string;
  nameAr: string;
  perspectives: Array<{ id: string; nameEn: string; nameAr: string; order: number }>;
  weighting: { perspectiveWeights: Record<string, number> } | null;
  publishedMap: { id: string; links: MapLinkRow[] } | null;
}

type PlacementStatus = "on_track" | "watch" | "off_track";

function toScorecard(row: unknown): Scorecard | null {
  if (typeof row !== "object" || row === null) return null;
  const record = row as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string" || !Array.isArray(record.perspectives)) return null;
  if (record.isBalancedScorecard === false || record.name.startsWith("E2E ")) return null;
  return record as unknown as Scorecard;
}

function mapStatus(status: ObjectiveStatus): PlacementStatus | null {
  if (status === "on-track") return "on_track";
  if (status === "at-risk") return "watch";
  if (status === "off-track") return "off_track";
  return null;
}

function compactPerspectiveName(name: string, index: number) {
  if (index === 2) return "Internal";
  if (index === 3) return "Learning";
  return name;
}

function perspectiveLabel(perspective: Perspective) {
  if (perspective.key === "internal-process") return "Internal Process";
  if (perspective.key === "learning-growth") return "Learning & Growth";
  return perspective.key[0]!.toUpperCase() + perspective.key.slice(1);
}

export default function ConnectedStrategyMapCanvas({ scorecardId }: { scorecardId: string }) {
  const utils = trpc.useUtils();
  const mapQuery = trpc.scorecard.get.useQuery({ scorecardId });
  const balancedQuery = trpc.scorecard.balanced.list.useQuery();
  const createObjective = trpc.scorecardSync.objective.create.useMutation();
  const updateObjective = trpc.scorecardSync.objective.update.useMutation();
  const deleteObjective = trpc.scorecardSync.objective.delete.useMutation();
  const upsertMapLink = trpc.scorecardSync.mapLink.upsert.useMutation();
  const deleteMapLink = trpc.scorecardSync.mapLink.delete.useMutation();

  const scorecard = useMemo(
    () => (balancedQuery.data ?? []).map(toScorecard).find((row): row is Scorecard => Boolean(row && row.id === scorecardId)),
    [balancedQuery.data, scorecardId],
  );
  const mapDetail = mapQuery.data as ScorecardMapDetail | undefined;

  const [roles, setRoles] = useState<string[]>([]);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [perspectiveFilter, setPerspectiveFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<PlacementStatus | "all">("all");
  const [depsVisible, setDepsVisible] = useState(true);
  const [connectMode, setConnectMode] = useState(false);
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [connectStrength, setConnectStrength] = useState<LinkStrength>("drives");
  const [objectiveEditor, setObjectiveEditor] = useState<{ objective?: ScorecardObjective; perspectiveId?: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScorecardObjective | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getMapAuthorization()
      .then((result) => setRoles(result.roles))
      .catch(() => setRoles([]))
      .finally(() => setAuthLoaded(true));
  }, []);

  const canEdit = roles.includes("strategy_analyst") || roles.includes("seo_administrator");
  const canConnect = roles.includes("strategy_analyst");
  const busy = createObjective.isPending || updateObjective.isPending || deleteObjective.isPending || upsertMapLink.isPending || deleteMapLink.isPending;

  const perspectives = useMemo(() => {
    if (!mapDetail || !scorecard) return [];
    return [...mapDetail.perspectives]
      .sort((a, b) => a.order - b.order)
      .map((perspective) => {
        const dataPerspective = scorecard.perspectives.find((row) => row.id === perspective.id);
        return {
          ...perspective,
          weight: mapDetail.weighting?.perspectiveWeights[perspective.id] ?? dataPerspective?.weight,
        };
      });
  }, [mapDetail, scorecard]);

  const objectives = useMemo(() => scorecard?.perspectives.flatMap((perspective) => perspective.objectives ?? []) ?? [], [scorecard]);
  const objectiveById = useMemo(() => new Map(objectives.map((objective) => [objective.id, objective])), [objectives]);
  const perspectiveByObjectiveId = useMemo(() => {
    const result = new Map<string, Perspective>();
    for (const perspective of scorecard?.perspectives ?? []) {
      for (const objective of perspective.objectives ?? []) result.set(objective.id, perspective);
    }
    return result;
  }, [scorecard]);

  const placements = useMemo<MapPlacement[]>(() => {
    if (!scorecard) return [];
    return scorecard.perspectives.flatMap((perspective) =>
      (perspective.objectives ?? []).map((objective) => ({
        perspectiveId: perspective.id,
        objectiveNodeId: objective.id,
        objectiveNameEn: objective.name,
        objectiveNameAr: objective.name,
        kpiNameEn: objective.linkedKpis[0] ?? null,
        status: mapStatus(objective.status),
      })),
    );
  }, [scorecard]);

  const visibleLinks = mapDetail?.publishedMap?.links ?? [];
  const selectedObjective = selectedObjectiveId ? objectiveById.get(selectedObjectiveId) ?? null : null;
  const selectedPerspective = selectedObjectiveId ? perspectiveByObjectiveId.get(selectedObjectiveId) ?? null : null;
  const selectedLaneIndex = selectedPerspective ? scorecard?.perspectives.findIndex((row) => row.id === selectedPerspective.id) ?? -1 : -1;
  const selectedNodeLinks = visibleLinks.filter((link) => link.fromObjectiveId === selectedObjectiveId || link.toObjectiveId === selectedObjectiveId);

  const isFiltering = Boolean(search.trim()) || perspectiveFilter !== "all" || statusFilter !== "all";
  const filteredPlacements = useMemo(() => placements.filter((placement) => {
    if (perspectiveFilter !== "all" && placement.perspectiveId !== perspectiveFilter) return false;
    if (statusFilter !== "all" && placement.status !== statusFilter) return false;
    const query = search.trim().toLowerCase();
    return !query || placement.objectiveNameEn.toLowerCase().includes(query);
  }), [placements, perspectiveFilter, search, statusFilter]);
  const filteredIds = useMemo(() => new Set(filteredPlacements.map((placement) => placement.objectiveNodeId)), [filteredPlacements]);
  const filteredLinks = useMemo(() => {
    if (!depsVisible) return [];
    if (!isFiltering) return visibleLinks;
    return visibleLinks.filter((link) => filteredIds.has(link.fromObjectiveId) && filteredIds.has(link.toObjectiveId));
  }, [depsVisible, filteredIds, isFiltering, visibleLinks]);

  useEffect(() => {
    if (selectedObjectiveId && !objectiveById.has(selectedObjectiveId)) setSelectedObjectiveId(null);
  }, [objectiveById, selectedObjectiveId]);

  if (!authLoaded || mapQuery.isLoading || balancedQuery.isLoading) {
    return <p className="p-8 text-sm text-gray-500">Loading strategy map…</p>;
  }
  if (!scorecard || !mapDetail) {
    return <div className="p-8 text-center text-sm text-gray-500">This scorecard is not available for Strategy Maps.</div>;
  }

  const refresh = async () => {
    await Promise.all([
      utils.scorecard.balanced.list.invalidate(),
      utils.scorecard.get.invalidate({ scorecardId }),
      utils.scorecard.placement.list.invalidate({ scorecardId }),
    ]);
  };

  const saveObjective = async (input: {
    perspectiveId: string;
    name: string;
    status: ObjectiveStatus;
    progress: number;
    ownerName: string;
    description: string | null;
    kpiSnapshotIds?: string[];
  }) => {
    setError(null); setMessage(null);
    try {
      if (objectiveEditor?.objective) {
        await updateObjective.mutateAsync({ scorecardId, objectiveNodeId: objectiveEditor.objective.id, ...input });
        setMessage("Objective updated in the scorecard and map.");
      } else {
        await createObjective.mutateAsync({ scorecardId, ...input });
        setMessage("Objective added to the scorecard and map.");
      }
      setObjectiveEditor(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save objective");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setError(null); setMessage(null);
    try {
      await deleteObjective.mutateAsync({ scorecardId, objectiveNodeId: deleteTarget.id });
      setSelectedObjectiveId(null);
      setDeleteTarget(null);
      setMessage("Objective and its map connections were deleted.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete objective");
    }
  };

  const addConnection = async (sourceId: string, targetId: string) => {
    setError(null); setMessage(null);
    try {
      await upsertMapLink.mutateAsync({ scorecardId, fromObjectiveId: sourceId, toObjectiveId: targetId, strength: connectStrength });
      setMessage(`${LINK_CONFIG[connectStrength].label} connection persisted.`);
      await utils.scorecard.get.invalidate({ scorecardId });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create connection");
    }
  };

  const removeConnection = async (linkId: string) => {
    if (!canConnect || !window.confirm("Delete this Strategy Map connection?")) return;
    setError(null); setMessage(null);
    try {
      await deleteMapLink.mutateAsync({ scorecardId, linkId });
      setMessage("Strategy Map connection deleted.");
      await utils.scorecard.get.invalidate({ scorecardId });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete connection");
    }
  };

  const handleObjectiveClick = (objectiveId: string) => {
    if (!connectMode) {
      setSelectedObjectiveId(objectiveId);
      return;
    }
    if (!pendingSource) {
      setPendingSource(objectiveId);
      return;
    }
    if (pendingSource === objectiveId) {
      setPendingSource(null);
      return;
    }
    void addConnection(pendingSource, objectiveId);
    setPendingSource(null);
  };

  const selectConnectedObjective = (objectiveId: string) => {
    setSearch("");
    setPerspectiveFilter("all");
    setStatusFilter("all");
    setSelectedObjectiveId(objectiveId);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ scorecard: scorecard.name, objectives, links: visibleLinks }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${scorecard.name.replace(/\s+/g, "-").toLowerCase()}-strategy-map.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const panelColor = perspectiveColors(selectedLaneIndex >= 0 ? selectedLaneIndex : 0);
  const panelStatus = selectedObjective ? mapStatus(selectedObjective.status) : null;
  const infoCard = (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-sm font-semibold text-gray-900">{scorecard.name}</p>
      <p className="mt-0.5 text-xs text-gray-400">{scorecard.period} · {objectives.length} objectives · {visibleLinks.length} connections</p>
    </div>
  );

  return (
    <div className="w-full" data-testid="connected-strategy-map">
      <div className="flex min-h-[58px] flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50"><MapIcon className="h-4 w-4 text-blue-600" /></span>
        <div className="ml-auto flex items-center gap-2">
          {canConnect && <button type="button" onClick={() => { setConnectMode((value) => !value); setPendingSource(null); }} className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium ${connectMode ? "border-[#063b4d] bg-[#063b4d] text-white" : "border-gray-300 bg-white text-gray-700"}`}><Link2 className="h-4 w-4" /> Connect Nodes</button>}
          {canEdit && <button type="button" onClick={() => setObjectiveEditor({ perspectiveId: scorecard.perspectives[0]?.id })} className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white"><Plus className="h-4 w-4" /> Add Objective</button>}
          <button type="button" onClick={exportJson} className="flex items-center gap-1.5 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"><Download className="h-4 w-4" /> Export</button>
        </div>
      </div>

      {error && <p className="mx-4 mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p className="mx-4 mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">{message}</p>}

      {connectMode && (
        <div className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-white">
          <p className="text-sm">{pendingSource ? "Click the target objective." : "Choose a relationship, then click a source objective."}</p>
          <div className="flex items-center gap-2">
            {SEMANTIC_LINK_TYPES.map((type) => <button key={type} type="button" onClick={() => setConnectStrength(type)} className={`rounded-full px-2.5 py-1 text-xs ${connectStrength === type ? "bg-white/15" : ""}`}><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ background: LINK_CONFIG[type].color }} />{LINK_CONFIG[type].label}</button>)}
            <button type="button" onClick={() => { setConnectMode(false); setPendingSource(null); }} className="rounded p-1 hover:bg-white/10"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-[#f8fafc] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search objectives..." className="w-52 rounded-xl border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm" /></div>
          <button type="button" onClick={() => setPerspectiveFilter("all")} className={`rounded-xl px-3.5 py-2 text-xs font-semibold uppercase ${perspectiveFilter === "all" ? "bg-[#063b4d] text-white" : "border border-gray-200 bg-white text-gray-600"}`}>All</button>
          {perspectives.map((perspective, index) => {
            const Icon = perspectiveIcon(index);
            return <button key={perspective.id} type="button" onClick={() => setPerspectiveFilter(perspectiveFilter === perspective.id ? "all" : perspective.id)} className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold uppercase ${perspectiveFilter === perspective.id ? "bg-[#063b4d] text-white" : "border border-gray-200 bg-white text-gray-600"}`}><Icon className="h-3.5 w-3.5" />{compactPerspectiveName(perspective.nameEn, index)}</button>;
          })}
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as PlacementStatus | "all")} className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700"><option value="all">All Status</option>{(Object.keys(STATUS_LABEL) as PlacementStatus[]).map((key) => <option key={key} value={key}>{STATUS_LABEL[key]}</option>)}</select>
          <button type="button" onClick={() => setDepsVisible((value) => !value)} className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium ${depsVisible ? "bg-[#063b4d] text-white" : "border border-gray-300 bg-white text-gray-700"}`}><Link2 className="h-3.5 w-3.5" /> Dependencies</button>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">{SEMANTIC_LINK_TYPES.map((type) => <span key={type} className="flex items-center gap-1.5"><span className="h-px w-6" style={{ background: LINK_CONFIG[type].color }} />{LINK_CONFIG[type].label}</span>)}</div>
      </div>

      <div className="relative bg-[#f8fafc]">
        <div className={selectedObjective ? "lg:mr-[320px]" : ""}>
          <StrategyMapFlowCanvas perspectives={perspectives} placements={filteredPlacements} links={filteredLinks} editing={canConnect} selectedObjectiveId={selectedObjectiveId} onSelectObjective={handleObjectiveClick} onRemoveLink={canConnect ? (linkId) => void removeConnection(linkId) : undefined} connecting={connectMode} pendingSourceId={pendingSource} infoLabel={infoCard} />
        </div>

        {selectedObjective && selectedPerspective && (
          <aside className="absolute inset-y-0 right-0 z-20 hidden w-[320px] overflow-y-auto border-l border-gray-200 bg-white lg:flex lg:flex-col" data-testid="node-properties-panel">
            <div className="flex items-center justify-between px-4 py-3" style={{ background: panelColor.bandBg }}>
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: panelColor.textColor }}>{perspectiveLabel(selectedPerspective)}</span>
              <div className="flex items-center gap-1">
                {canEdit && <><button type="button" onClick={() => setObjectiveEditor({ objective: selectedObjective, perspectiveId: selectedPerspective.id })} className="rounded p-1.5 text-gray-500 hover:bg-white/70"><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => setDeleteTarget(selectedObjective)} className="rounded p-1.5 text-gray-500 hover:bg-white/70 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button></>}
                <button type="button" onClick={() => setSelectedObjectiveId(null)} className="rounded p-1.5 text-gray-500 hover:bg-white/70"><X className="h-3.5 w-3.5" /></button>
              </div>
            </div>

            <div className="flex-1 space-y-5 p-4">
              <div><h3 className="text-base font-semibold text-gray-900">{selectedObjective.name}</h3><div className="mt-2 flex items-center gap-2">{panelStatus && <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: STATUS_PILL[panelStatus].bg, color: STATUS_PILL[panelStatus].text }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_DOT[panelStatus] }} />{STATUS_LABEL[panelStatus]}</span>}<span className="text-xs text-gray-500">{selectedObjective.progress}%</span></div></div>
              <div className="flex items-center gap-4 rounded-xl bg-gray-50 p-3"><div className="grid h-14 w-14 place-items-center rounded-full" style={{ background: `conic-gradient(${panelColor.accent} ${selectedObjective.progress}%, #e5e7eb 0)` }}><div className="grid h-10 w-10 place-items-center rounded-full bg-white text-xs font-semibold">{selectedObjective.progress}%</div></div><div><p className="text-sm font-semibold">Completion</p><p className="text-xs text-gray-500">{selectedObjective.ownerName}</p><p className="text-xs text-gray-400">{scorecard.period}</p></div></div>
              <div><p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">Description</p><p className="mt-2 text-sm leading-6 text-gray-600">{selectedObjective.description || "No description has been added for this objective."}</p></div>
              <div><p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">Linked KPIs</p><div className="mt-2 flex flex-wrap gap-1.5">{selectedObjective.linkedKpis.length > 0 ? selectedObjective.linkedKpis.map((kpi) => <span key={kpi} className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">{kpi}</span>) : <span className="text-xs text-gray-400">No KPI linked</span>}</div></div>
              <div><p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">Connections ({selectedNodeLinks.length})</p><div className="mt-2 space-y-2">{selectedNodeLinks.map((link) => { const outgoing = link.fromObjectiveId === selectedObjective.id; const otherId = outgoing ? link.toObjectiveId : link.fromObjectiveId; const config = LINK_CONFIG[link.strength]; return <button key={link.id} type="button" onClick={() => selectConnectedObjective(otherId)} className="flex w-full items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5 text-left text-xs hover:bg-gray-100"><span className="min-w-0"><span className="block text-[10px] uppercase text-gray-400">{outgoing ? <><ArrowRight className="mr-1 inline h-3 w-3" />{config.label}</> : <><ArrowLeft className="mr-1 inline h-3 w-3" />{config.label}</>}</span><span className="block truncate font-medium text-gray-800">{objectiveById.get(otherId)?.name ?? otherId}</span></span><ExternalLink className="h-3.5 w-3.5 text-sky-500" /></button>; })}{selectedNodeLinks.length === 0 && <p className="text-xs text-gray-400">No connections yet.</p>}</div></div>
            </div>
            {(canEdit || canConnect) && <div className="grid grid-cols-2 gap-2 border-t border-gray-100 p-3"><button type="button" disabled={!canEdit} onClick={() => setObjectiveEditor({ objective: selectedObjective, perspectiveId: selectedPerspective.id })} className="flex items-center justify-center gap-1.5 rounded-full border border-gray-300 px-3 py-2 text-sm disabled:opacity-40"><Pencil className="h-3.5 w-3.5" /> Edit</button><button type="button" disabled={!canConnect} onClick={() => { setConnectMode(true); setPendingSource(selectedObjective.id); }} className="flex items-center justify-center gap-1.5 rounded-full bg-sky-600 px-3 py-2 text-sm text-white disabled:opacity-40"><Link2 className="h-3.5 w-3.5" /> Connect</button></div>}
          </aside>
        )}
      </div>

      {objectiveEditor && <ScorecardObjectiveModal objective={objectiveEditor.objective} perspectives={scorecard.perspectives} defaultPerspectiveId={objectiveEditor.perspectiveId} defaultOwnerName={scorecard.ownerName} busy={busy} onClose={() => setObjectiveEditor(null)} onSave={saveObjective} />}
      {deleteTarget && <DeleteObjectiveModal objectiveName={deleteTarget.name} busy={busy} onCancel={() => setDeleteTarget(null)} onDelete={() => void confirmDelete()} />}
    </div>
  );
}