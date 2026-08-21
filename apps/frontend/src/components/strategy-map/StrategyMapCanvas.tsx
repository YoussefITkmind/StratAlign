"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Download, Link2, Map as MapIcon, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import StrategyMapFlowCanvas from "./StrategyMapFlowCanvas";
import type { MapPlacement, MapLinkRow } from "@/lib/buildStrategyMapFlow";
import AddObjectiveModal from "./AddObjectiveModal";
import NewMapModal from "./NewMapModal";
import {
  createScorecard, draftMapLink, placeObjective, proposeMap, publishMap, removeMapLink,
} from "@/app/(app)/strategy-maps/actions";
import { getMapAuthorization } from "@/app/(app)/strategy-maps/authorization";
import { STATUS_DOT, STATUS_LABEL, STATUS_PILL, LINK_CONFIG, perspectiveColors, perspectiveIcon, type LinkStrength } from "@/lib/strategyMapVisualConfig";
import { DEMO_SCORECARD_ID, demoScorecard, demoPerspectives, demoPlacements, demoLinks } from "@/data/demoStrategyMap";

interface Perspective { id: string; nameEn: string; nameAr: string; order: number }
interface ScorecardWeighting { perspectiveWeights: Record<string, number> }
interface ScorecardDetail {
  id: string; nameEn: string; nameAr: string; planVersionId: string;
  perspectives: Perspective[];
  weighting: ScorecardWeighting | null;
  publishedMap: { id: string; links: MapLinkRow[] } | null;
}
type PlacementStatus = "on_track" | "watch" | "off_track";
interface StrategyNode { id: string; type: string; nameEn: string; planVersionId: string; state?: string }
interface ScorecardTab { id: string; nameEn: string }

const EMPTY_PLACEMENTS: MapPlacement[] = [];
const EMPTY_NODES: StrategyNode[] = [];
const EMPTY_TABS: ScorecardTab[] = [];

/** Shown when there is no reachable backend so the canvas still renders the designed layout instead of "not found" — not real persisted data. */
const DEMO_SCORECARD_DETAIL: ScorecardDetail = {
  id: demoScorecard.id, nameEn: demoScorecard.nameEn, nameAr: demoScorecard.nameAr, planVersionId: demoScorecard.planVersionId,
  perspectives: demoPerspectives.map(({ id, nameEn, nameAr, order }) => ({ id, nameEn, nameAr, order })),
  weighting: { perspectiveWeights: Object.fromEntries(demoPerspectives.map((perspective) => [perspective.id, perspective.weight ?? 0])) },
  publishedMap: { id: "demo-map", links: demoLinks },
};

export default function StrategyMapCanvas({ scorecardId }: { scorecardId: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const isDemo = scorecardId === DEMO_SCORECARD_ID;
  const scorecardQuery = trpc.scorecard.get.useQuery({ scorecardId }, { enabled: !isDemo });
  const placementsQuery = trpc.scorecard.placement.list.useQuery({ scorecardId }, { enabled: !isDemo });
  const nodesQuery = trpc.strategy.nodes.useQuery(undefined, { enabled: !isDemo });
  const scorecardsQuery = trpc.scorecard.list.useQuery();
  const scorecard = isDemo ? DEMO_SCORECARD_DETAIL : (scorecardQuery.data as ScorecardDetail | undefined);
  const placements = isDemo ? demoPlacements : ((placementsQuery.data as MapPlacement[] | undefined) ?? EMPTY_PLACEMENTS);
  const strategyNodes = (nodesQuery.data as StrategyNode[] | undefined) ?? EMPTY_NODES;
  const realTabs = (scorecardsQuery.data as ScorecardTab[] | undefined) ?? EMPTY_TABS;
  const tabs = realTabs.length > 0 ? realTabs : [{ id: scorecardId, nameEn: scorecard?.nameEn ?? "" }];

  const [roles, setRoles] = useState<string[]>([]);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draftMapId, setDraftMapId] = useState<string | null>(null);
  const [draftLinks, setDraftLinks] = useState<MapLinkRow[]>([]);
  const [approverId, setApproverId] = useState("");
  const [publishMapId, setPublishMapId] = useState("");
  const [publishCaseId, setPublishCaseId] = useState("");
  const [submitted, setSubmitted] = useState<{ id: string; mapId: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [perspectiveFilter, setPerspectiveFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<PlacementStatus | "all">("all");
  const [depsVisible, setDepsVisible] = useState(true);
  const [connectMode, setConnectMode] = useState(false);
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [connectStrength, setConnectStrength] = useState<LinkStrength>("strong");
  const [addObjectiveOpen, setAddObjectiveOpen] = useState(false);
  const [newMapOpen, setNewMapOpen] = useState(false);

  useEffect(() => {
    void getMapAuthorization().then((result) => setRoles(result.roles)).catch(() => setRoles([])).finally(() => setAuthLoaded(true));
  }, []);

  const isAnalyst = roles.includes("strategy_analyst");
  const placedIds = useMemo(() => new Set(placements.map((item) => item.objectiveNodeId)), [placements]);
  const eligibleObjectives = useMemo(() => strategyNodes.filter((node) =>
    node.type.toLowerCase() === "objective" && node.planVersionId === scorecard?.planVersionId && !placedIds.has(node.id) &&
    (!node.state || node.state.toLowerCase() === "active")), [strategyNodes, scorecard?.planVersionId, placedIds]);
  const objectiveNames = useMemo(() => new Map(placements.map((item) => [item.objectiveNodeId, item.objectiveNameEn])), [placements]);
  const visibleLinks = useMemo(() => draftMapId ? draftLinks : (scorecard?.publishedMap?.links ?? []), [draftMapId, draftLinks, scorecard?.publishedMap?.links]);
  const selectedPlacement = placements.find((item) => item.objectiveNodeId === selectedObjectiveId) ?? null;

  const perspectivesWithWeight = useMemo(
    () => (scorecard?.perspectives ?? []).map((perspective) => ({ ...perspective, weight: scorecard?.weighting?.perspectiveWeights[perspective.id] })),
    [scorecard?.perspectives, scorecard?.weighting],
  );
  const sortedPerspectives = useMemo(() => [...(scorecard?.perspectives ?? [])].sort((a, b) => a.order - b.order), [scorecard?.perspectives]);
  const selectedLaneIndex = sortedPerspectives.findIndex((perspective) => perspective.id === selectedPlacement?.perspectiveId);
  const selectedPerspective = selectedLaneIndex >= 0 ? sortedPerspectives[selectedLaneIndex] : null;

  const isFilteringMap = Boolean(search.trim()) || perspectiveFilter !== "all" || statusFilter !== "all";
  const filteredPlacements = useMemo(() => placements.filter((item) => {
    if (perspectiveFilter !== "all" && item.perspectiveId !== perspectiveFilter) return false;
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    const query = search.trim().toLowerCase();
    if (query && !item.objectiveNameEn.toLowerCase().includes(query)) return false;
    return true;
  }), [placements, perspectiveFilter, statusFilter, search]);
  const filteredObjectiveIds = useMemo(() => new Set(filteredPlacements.map((item) => item.objectiveNodeId)), [filteredPlacements]);
  const filteredLinks = useMemo(() => {
    if (!depsVisible) return [];
    if (!isFilteringMap) return visibleLinks;
    return visibleLinks.filter((link) => filteredObjectiveIds.has(link.fromObjectiveId) && filteredObjectiveIds.has(link.toObjectiveId));
  }, [visibleLinks, filteredObjectiveIds, isFilteringMap, depsVisible]);
  const selectedNodeLinks = useMemo(
    () => visibleLinks.filter((link) => link.fromObjectiveId === selectedObjectiveId || link.toObjectiveId === selectedObjectiveId),
    [visibleLinks, selectedObjectiveId],
  );

  if (!authLoaded || scorecardQuery.isLoading || placementsQuery.isLoading || nodesQuery.isLoading) return <p className="p-8 text-sm text-gray-500">Loading strategy map…</p>;
  if (!scorecard || scorecardQuery.error) return <div data-testid="map-canvas-not-found" className="p-8 text-center">Strategy map not found.</div>;

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(null); setMessage(null);
    try { await action(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Strategy map operation failed."); }
    finally { setBusy(false); }
  };

  const copyPublishedToDraft = async () => {
    let mapId: string | undefined;
    const copied: MapLinkRow[] = [];
    for (const link of scorecard.publishedMap?.links ?? []) {
      const result = await draftMapLink({ scorecardId, strategyMapId: mapId, link: {
        fromObjectiveId: link.fromObjectiveId, toObjectiveId: link.toObjectiveId, strength: link.strength,
      } }) as { map: { id: string }; link: MapLinkRow };
      mapId = result.map.id; copied.push(result.link);
    }
    return { mapId: mapId ?? null, copied };
  };

  const addObjective = (objectiveNodeId: string, perspectiveId: string) => run(async () => {
    await placeObjective({ objectiveNodeId, perspectiveId });
    await utils.scorecard.placement.list.invalidate({ scorecardId });
    setMessage("Objective added and persisted.");
  });

  const addLink = (sourceId: string, targetId: string, strength: "weak" | "strong") => run(async () => {
    let mapId = draftMapId;
    let current = draftLinks;
    if (!mapId) {
      const seeded = await copyPublishedToDraft();
      mapId = seeded.mapId; current = seeded.copied;
    }
    const result = await draftMapLink({ scorecardId, strategyMapId: mapId ?? undefined, link: {
      fromObjectiveId: sourceId, toObjectiveId: targetId, strength,
    } }) as { map: { id: string }; link: MapLinkRow };
    setDraftMapId(result.map.id); setDraftLinks([...current, result.link]);
  });

  const startConnectFrom = (objectiveId: string) => {
    setConnectMode(true);
    setPendingSource(objectiveId);
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
    void addLink(pendingSource, objectiveId, connectStrength);
    setPendingSource(null);
  };

  const removeLink = (linkId: string) => run(async () => {
    if (!draftMapId) return;
    await removeMapLink({ strategyMapId: draftMapId, linkId });
    setDraftLinks((current) => current.filter((link) => link.id !== linkId));
  });

  const submit = () => run(async () => {
    if (!draftMapId || !approverId.trim()) return;
    const result = await proposeMap({ strategyMapId: draftMapId, approvalParticipantId: approverId.trim() }) as { id: string };
    setSubmitted({ id: result.id, mapId: draftMapId }); setPublishMapId(draftMapId);
    setMessage("Strategy map submitted for approval.");
  });

  const publish = () => run(async () => {
    if (!publishMapId.trim() || !publishCaseId.trim()) return;
    await publishMap({ strategyMapId: publishMapId.trim(), approvalCaseId: publishCaseId.trim() });
    await utils.scorecard.get.invalidate({ scorecardId });
    setDraftMapId(null); setDraftLinks([]); setSubmitted(null); setMessage("Approved strategy map published.");
  });

  const createMap = (name: string) => run(async () => {
    const result = await createScorecard({ nameEn: name, planVersionId: scorecard.planVersionId }) as { id: string };
    await utils.scorecard.list.invalidate();
    setNewMapOpen(false);
    router.push(`/strategy-maps/${result.id}`);
  });

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ scorecard: { id: scorecard.id, nameEn: scorecard.nameEn }, perspectives: sortedPerspectives, placements, links: visibleLinks }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${scorecard.nameEn.replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const infoCard = (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-sm font-semibold text-gray-900">{scorecard.nameEn}</p>
      <p className="mt-0.5 text-xs text-gray-400">{placements.length} objectives · {visibleLinks.length} connections</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-3 p-4 sm:p-6" data-testid="map-canvas-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50">
            <MapIcon className="h-4 w-4 text-blue-600" />
          </span>
          {tabs.map((tab) => {
            const active = tab.id === scorecardId;
            return (
              <button
                key={tab.id}
                data-testid={`strategy-map-tab-${tab.id}`}
                onClick={() => router.push(`/strategy-maps/${tab.id}`)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${active ? "bg-slate-900 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50"}`}
              >
                {tab.nameEn}
              </button>
            );
          })}
          {isAnalyst && (
            <button
              onClick={() => setNewMapOpen(true)}
              data-testid="new-map-button"
              className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-gray-300 px-4 py-2 text-sm font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600"
            >
              <Plus className="h-3.5 w-3.5" /> New Map
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isAnalyst && (
            <>
              <button
                data-testid="connect-nodes-button"
                disabled={busy}
                onClick={() => { setConnectMode((value) => !value); setPendingSource(null); }}
                className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-40 ${connectMode ? "border-slate-900 bg-slate-900 text-white" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
              >
                <Link2 className="h-4 w-4" /> Connect Nodes
              </button>
              <button
                data-testid="add-objective-button"
                disabled={busy}
                onClick={() => setAddObjectiveOpen(true)}
                className="flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" /> Add Objective
              </button>
            </>
          )}
          <button onClick={exportJson} className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p data-testid="map-notice" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">{message}</p>}

      {connectMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-white">
          <p className="text-sm">
            {pendingSource ? "Click the target objective to connect it." : "Pick a link strength, then click a source objective."}
          </p>
          <div className="flex items-center gap-2">
            {(["weak", "strong"] as LinkStrength[]).map((strength) => {
              const on = connectStrength === strength;
              return (
                <button
                  key={strength}
                  data-testid={`connect-strength-${strength}`}
                  onClick={() => setConnectStrength(strength)}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize"
                  style={{ background: on ? "rgba(255,255,255,0.15)" : "transparent", boxShadow: on ? `inset 0 0 0 1px ${LINK_CONFIG[strength].color}` : undefined }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: LINK_CONFIG[strength].color }} />
                  {strength}
                </button>
              );
            })}
            <button onClick={() => { setConnectMode(false); setPendingSource(null); }} className="rounded-full p-1 hover:bg-white/10">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search objectives..."
            className="w-56 rounded-full border border-gray-300 py-2 pl-9 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          onClick={() => setPerspectiveFilter("all")}
          className={`rounded-full px-3.5 py-2 text-xs font-semibold uppercase tracking-wide ${perspectiveFilter === "all" ? "bg-slate-900 text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-50"}`}
        >
          All
        </button>
        {sortedPerspectives.map((perspective, index) => {
          const Icon = perspectiveIcon(index);
          return (
            <button
              key={perspective.id}
              onClick={() => setPerspectiveFilter(perspective.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold uppercase tracking-wide ${perspectiveFilter === perspective.id ? "bg-slate-900 text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-50"}`}
            >
              <Icon className="h-3.5 w-3.5" /> {perspective.nameEn}
            </button>
          );
        })}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PlacementStatus | "all")}
          className="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 outline-none focus:border-indigo-500"
        >
          <option value="all">All Status</option>
          {(Object.keys(STATUS_LABEL) as PlacementStatus[]).map((key) => <option key={key} value={key}>{STATUS_LABEL[key]}</option>)}
        </select>
        <button
          onClick={() => setDepsVisible((value) => !value)}
          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium ${depsVisible ? "bg-slate-900 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50"}`}
        >
          <Link2 className="h-3.5 w-3.5" /> Dependencies
        </button>
        <div className="ml-auto flex items-center gap-4 text-xs font-medium text-gray-600">
          <span className="flex items-center gap-1.5"><span className="h-px w-5 rounded-full" style={{ background: LINK_CONFIG.weak.color }} /> Weak</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded-full" style={{ background: LINK_CONFIG.strong.color }} /> Strong</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <StrategyMapFlowCanvas
          perspectives={perspectivesWithWeight}
          placements={filteredPlacements}
          links={filteredLinks}
          editing={!!draftMapId}
          selectedObjectiveId={selectedObjectiveId}
          onSelectObjective={handleObjectiveClick}
          onRemoveLink={isAnalyst ? (id) => void removeLink(id) : undefined}
          connecting={connectMode}
          pendingSourceId={pendingSource}
          infoLabel={infoCard}
        />

        <aside className="flex flex-col gap-4">
          <div data-testid="node-properties-panel" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            {selectedPlacement ? (
              <>
                <div className="mb-3 flex items-center justify-between">
                  {selectedPerspective ? (
                    <span
                      className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: perspectiveColors(selectedLaneIndex).textColor }}
                    >
                      {selectedPerspective.nameEn}
                    </span>
                  ) : <span />}
                  <div className="flex items-center gap-1">
                    {isAnalyst && (
                      <button
                        title="Draw a link from here"
                        onClick={() => startConnectFrom(selectedPlacement.objectiveNodeId)}
                        className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button title="Close" onClick={() => setSelectedObjectiveId(null)} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <h3 className="mb-2 text-base font-semibold text-gray-900">{selectedPlacement.objectiveNameEn}</h3>

                {selectedPlacement.status && (
                  <span
                    className="mb-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{ background: STATUS_PILL[selectedPlacement.status].bg, color: STATUS_PILL[selectedPlacement.status].text }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_DOT[selectedPlacement.status] }} />
                    {STATUS_LABEL[selectedPlacement.status]}
                  </span>
                )}

                <div className="my-3 border-t border-gray-100" />
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Linked KPI</p>
                {selectedPlacement.kpiNameEn ? (
                  <span className="inline-block rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">{selectedPlacement.kpiNameEn}</span>
                ) : (
                  <p className="text-xs text-gray-400">No KPI linked</p>
                )}

                <div className="my-3 border-t border-gray-100" />
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Connections ({selectedNodeLinks.length})</p>
                <div className="space-y-1.5" data-testid="node-connections-list">
                  {selectedNodeLinks.map((link) => {
                    const outgoing = link.fromObjectiveId === selectedPlacement.objectiveNodeId;
                    const otherId = outgoing ? link.toObjectiveId : link.fromObjectiveId;
                    return (
                      <div key={link.id} data-testid={`map-link-${link.id}`} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs">
                        <span className="flex min-w-0 items-center gap-1.5">
                          {outgoing ? <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-400" /> : <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
                          <span className="truncate">{objectiveNames.get(otherId) ?? otherId}</span>
                          <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] uppercase text-gray-500">{link.strength}</span>
                        </span>
                        {isAnalyst && draftMapId && (
                          <button aria-label="Remove link" onClick={() => void removeLink(link.id)} className="shrink-0 text-red-500">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {selectedNodeLinks.length === 0 && <p className="text-xs text-gray-400">No connections yet.</p>}
                </div>
              </>
            ) : (
              <>
                <h2 className="mb-2 text-sm font-semibold text-gray-800">Objective detail</h2>
                <p className="text-xs text-gray-400">Select an objective on the canvas to view its details.</p>
              </>
            )}
          </div>

          {isAnalyst && draftMapId && (
            <section className="rounded-2xl border bg-white p-4">
              <h2 className="mb-2 font-semibold">Submit draft for approval</h2>
              <div className="flex flex-col gap-2">
                <input data-testid="approval-participant-id" value={approverId} onChange={(e) => setApproverId(e.target.value)} placeholder="Approver user UUID" className="w-full rounded-lg border p-2 text-sm" />
                <button data-testid="submit-for-approval-button" disabled={busy || !draftMapId || !approverId.trim()} onClick={() => void submit()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Submit</button>
              </div>
            </section>
          )}

          {submitted && <p data-testid="submitted-map-case" data-case-id={submitted.id} data-map-id={submitted.mapId} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Pending approval · {submitted.id}</p>}

          {isAnalyst && (
            <section data-testid="publish-approved-map" className="rounded-2xl border bg-white p-4">
              <h2 className="mb-2 font-semibold">Publish approved draft</h2>
              <div className="flex flex-col gap-2">
                <input data-testid="publish-map-id" value={publishMapId} onChange={(e) => setPublishMapId(e.target.value)} placeholder="Strategy map UUID" className="rounded-lg border p-2 text-sm" />
                <input data-testid="publish-case-id" value={publishCaseId} onChange={(e) => setPublishCaseId(e.target.value)} placeholder="Approved case UUID" className="rounded-lg border p-2 text-sm" />
                <button data-testid="publish-map-button" disabled={busy || !publishMapId.trim() || !publishCaseId.trim()} onClick={() => void publish()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Publish</button>
              </div>
            </section>
          )}
        </aside>
      </div>

      {addObjectiveOpen && (
        <AddObjectiveModal
          objectives={eligibleObjectives}
          perspectives={scorecard.perspectives}
          busy={busy}
          onClose={() => setAddObjectiveOpen(false)}
          onAdd={addObjective}
        />
      )}
      {newMapOpen && <NewMapModal busy={busy} onClose={() => setNewMapOpen(false)} onCreate={createMap} />}
    </div>
  );
}
