"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Download, ExternalLink, Link2, Map as MapIcon, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import StrategyMapFlowCanvas from "./StrategyMapFlowCanvas";
import type { MapPlacement, MapLinkRow } from "@/lib/buildStrategyMapFlow";
import AddObjectiveModal from "./AddObjectiveModal";
import NewMapModal from "./NewMapModal";
import EditObjectiveModal, { type EditableObjectiveStatus } from "./EditObjectiveModal";
import DeleteObjectiveModal from "./DeleteObjectiveModal";
import {
  createScorecard, draftMapLink, placeObjective, proposeMap, publishMap, removeMapLink,
} from "@/app/(app)/strategy-maps/actions";
import { getMapAuthorization } from "@/app/(app)/strategy-maps/authorization";
import {
  STATUS_DOT,
  STATUS_LABEL,
  STATUS_PILL,
  LINK_CONFIG,
  SEMANTIC_LINK_TYPES,
  perspectiveColors,
  perspectiveIcon,
  type LinkStrength,
} from "@/lib/strategyMapVisualConfig";
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
interface BalancedScorecardTab { id: string }
interface PlacementDetail extends MapPlacement {
  owners?: Array<{ id: string; displayName: string | null; email: string }>;
  progress?: number | null;
  score?: number | null;
  kpiCount?: number;
}
interface HierarchyNode {
  id: string;
  name: string;
  type: "plan" | "perspective" | "objective" | "initiative" | "project";
  status: EditableObjectiveStatus;
  progress: number;
  owner: { name: string; initials: string; color: string };
  description: string | null;
  linkedKpis: string[];
  startDate: Date | string | null;
  endDate: Date | string | null;
  children: HierarchyNode[];
}

const EMPTY_PLACEMENTS: PlacementDetail[] = [];
const EMPTY_NODES: StrategyNode[] = [];
const EMPTY_TABS: ScorecardTab[] = [];
const EMPTY_BALANCED_TABS: BalancedScorecardTab[] = [];

const DEMO_SCORECARD_DETAIL: ScorecardDetail = {
  id: demoScorecard.id, nameEn: demoScorecard.nameEn, nameAr: demoScorecard.nameAr, planVersionId: demoScorecard.planVersionId,
  perspectives: demoPerspectives.map(({ id, nameEn, nameAr, order }) => ({ id, nameEn, nameAr, order })),
  weighting: { perspectiveWeights: Object.fromEntries(demoPerspectives.map((perspective) => [perspective.id, perspective.weight ?? 0])) },
  publishedMap: { id: "demo-map", links: demoLinks },
};

function flattenHierarchy(root: HierarchyNode | null | undefined): HierarchyNode[] {
  if (!root) return [];
  return [root, ...root.children.flatMap((child) => flattenHierarchy(child))];
}

function periodLabel(node: HierarchyNode | null) {
  if (!node?.endDate) return "FY 2025";
  const date = new Date(node.endDate);
  return Number.isNaN(date.getTime()) ? "FY 2025" : `FY ${date.getUTCFullYear()}`;
}

function hierarchyStatusToPlacement(status: EditableObjectiveStatus): PlacementStatus | null {
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

export default function StrategyMapCanvas({ scorecardId }: { scorecardId: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const isDemo = scorecardId === DEMO_SCORECARD_ID;
  const scorecardQuery = trpc.scorecard.get.useQuery({ scorecardId }, { enabled: !isDemo });
  const placementsQuery = trpc.scorecard.placement.list.useQuery({ scorecardId }, { enabled: !isDemo });
  const nodesQuery = trpc.strategy.nodes.useQuery(undefined, { enabled: !isDemo });
  const scorecardsQuery = trpc.scorecard.list.useQuery();
  const balancedScorecardsQuery = trpc.scorecard.balanced.list.useQuery();
  const hierarchyQuery = trpc.strategyHierarchy.tree.useQuery(undefined, { enabled: !isDemo });
  const scorecard = isDemo ? DEMO_SCORECARD_DETAIL : (scorecardQuery.data as ScorecardDetail | undefined);
  const placements = isDemo ? (demoPlacements as PlacementDetail[]) : ((placementsQuery.data as PlacementDetail[] | undefined) ?? EMPTY_PLACEMENTS);
  const strategyNodes = (nodesQuery.data as StrategyNode[] | undefined) ?? EMPTY_NODES;
  const allScorecards = (scorecardsQuery.data as ScorecardTab[] | undefined) ?? EMPTY_TABS;
  const balancedScorecards = (balancedScorecardsQuery.data as BalancedScorecardTab[] | undefined) ?? EMPTY_BALANCED_TABS;
  const balancedIds = useMemo(() => new Set(balancedScorecards.map((item) => item.id)), [balancedScorecards]);
  const realTabs = useMemo(
    () => allScorecards.filter((item) => !balancedIds.has(item.id) && !item.nameEn.startsWith("E2E ")),
    [allScorecards, balancedIds],
  );
  const tabs = realTabs.length > 0 ? realTabs : [{ id: scorecardId, nameEn: scorecard?.nameEn ?? "" }];
  const hierarchyNodes = useMemo(() => flattenHierarchy(hierarchyQuery.data as HierarchyNode | null | undefined), [hierarchyQuery.data]);

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
  const [connectStrength, setConnectStrength] = useState<LinkStrength>("drives");
  const [addObjectiveOpen, setAddObjectiveOpen] = useState(false);
  const [newMapOpen, setNewMapOpen] = useState(false);
  const [editObjectiveOpen, setEditObjectiveOpen] = useState(false);
  const [deleteObjectiveOpen, setDeleteObjectiveOpen] = useState(false);

  useEffect(() => {
    void getMapAuthorization().then((result) => setRoles(result.roles)).catch(() => setRoles([])).finally(() => setAuthLoaded(true));
  }, []);

  const isAnalyst = roles.includes("strategy_analyst");
  const isSeoAdmin = roles.includes("seo_administrator");
  const updateObjective = trpc.strategyHierarchy.updateNode.useMutation();
  const deleteObjective = trpc.strategyHierarchy.deleteNode.useMutation();

  const placedIds = useMemo(() => new Set(placements.map((item) => item.objectiveNodeId)), [placements]);
  const eligibleObjectives = useMemo(() => strategyNodes.filter((node) =>
    node.type.toLowerCase() === "objective" && node.planVersionId === scorecard?.planVersionId && !placedIds.has(node.id) &&
    (!node.state || node.state.toLowerCase() === "active")), [strategyNodes, scorecard?.planVersionId, placedIds]);
  const objectiveNames = useMemo(() => new Map(placements.map((item) => [item.objectiveNodeId, item.objectiveNameEn])), [placements]);
  const visibleLinks = useMemo(() => draftMapId ? draftLinks : (scorecard?.publishedMap?.links ?? []), [draftMapId, draftLinks, scorecard?.publishedMap?.links]);
  const selectedPlacement = placements.find((item) => item.objectiveNodeId === selectedObjectiveId) ?? null;
  const selectedHierarchyNode = hierarchyNodes.find((node) => node.id === selectedObjectiveId && node.type === "objective") ?? null;

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

  useEffect(() => {
    if (selectedObjectiveId && isFilteringMap && !filteredObjectiveIds.has(selectedObjectiveId)) {
      setSelectedObjectiveId(null);
    }
  }, [filteredObjectiveIds, isFilteringMap, selectedObjectiveId]);

  const loading = !authLoaded || scorecardQuery.isLoading || placementsQuery.isLoading || nodesQuery.isLoading || (!isDemo && hierarchyQuery.isLoading);
  if (loading) return <p className="p-8 text-sm text-gray-500">Loading strategy map…</p>;
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

  const addLink = (sourceId: string, targetId: string, strength: LinkStrength) => run(async () => {
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
    setMessage(`${LINK_CONFIG[strength].label} connection added to the draft map.`);
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

  const selectConnectedObjective = (objectiveId: string) => {
    setSearch("");
    setPerspectiveFilter("all");
    setStatusFilter("all");
    setSelectedObjectiveId(objectiveId);
  };

  const removeLink = (linkId: string) => run(async () => {
    if (!draftMapId) return;
    await removeMapLink({ strategyMapId: draftMapId, linkId });
    setDraftLinks((current) => current.filter((link) => link.id !== linkId));
  });

  const saveObjective = (patch: { name: string; status: EditableObjectiveStatus; progress: number; ownerName: string; description: string | null }) => {
    if (!selectedHierarchyNode || isDemo) return;
    void run(async () => {
      await updateObjective.mutateAsync({ id: selectedHierarchyNode.id, ...patch });
      await Promise.all([
        utils.strategyHierarchy.tree.invalidate(),
        utils.scorecard.placement.list.invalidate({ scorecardId }),
      ]);
      setEditObjectiveOpen(false);
      setMessage("Objective updated and persisted.");
    });
  };

  const confirmDeleteObjective = () => {
    if (!selectedHierarchyNode || isDemo) return;
    const id = selectedHierarchyNode.id;
    void run(async () => {
      await deleteObjective.mutateAsync({ id });
      setSelectedObjectiveId(null);
      setDeleteObjectiveOpen(false);
      setDraftLinks((current) => current.filter((link) => link.fromObjectiveId !== id && link.toObjectiveId !== id));
      await Promise.all([
        utils.strategyHierarchy.tree.invalidate(),
        utils.scorecard.placement.list.invalidate({ scorecardId }),
        utils.scorecard.get.invalidate({ scorecardId }),
      ]);
      setMessage("Objective and its strategy-map connections were deleted.");
    });
  };

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
      <p className="mt-0.5 text-xs text-gray-400">FY 2025 · {placements.length} objectives · {visibleLinks.length} connections</p>
    </div>
  );

  const objectiveProgress = selectedHierarchyNode?.progress ?? selectedPlacement?.progress ?? selectedPlacement?.score ?? 0;
  const objectiveOwner = selectedHierarchyNode?.owner.name ?? selectedPlacement?.owners?.[0]?.displayName ?? selectedPlacement?.owners?.[0]?.email ?? "Unassigned";
  const objectiveKpis = selectedHierarchyNode?.linkedKpis?.length
    ? selectedHierarchyNode.linkedKpis
    : selectedPlacement?.kpiNameEn ? [selectedPlacement.kpiNameEn] : [];
  const panelStatus = selectedHierarchyNode ? hierarchyStatusToPlacement(selectedHierarchyNode.status) : selectedPlacement?.status ?? null;
  const panelColor = selectedLaneIndex >= 0 ? perspectiveColors(selectedLaneIndex) : perspectiveColors(0);

  return (
    <div className="w-full" data-testid="map-canvas-page">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50">
            <MapIcon className="h-4 w-4 text-blue-600" />
          </span>
          {tabs.map((tab) => {
            const active = tab.id === scorecardId;
            return (
              <button key={tab.id} data-testid={`strategy-map-tab-${tab.id}`} onClick={() => router.push(`/strategy-maps/${tab.id}`)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${active ? "bg-[#063b4d] text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
                {tab.nameEn}
              </button>
            );
          })}
          {isAnalyst && (
            <button onClick={() => setNewMapOpen(true)} data-testid="new-map-button" className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-gray-300 px-4 py-2 text-sm font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600">
              <Plus className="h-3.5 w-3.5" /> New Map
            </button>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isAnalyst && (
            <>
              <button data-testid="connect-nodes-button" disabled={busy} onClick={() => { setConnectMode((value) => !value); setPendingSource(null); }} className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-40 ${connectMode ? "border-[#063b4d] bg-[#063b4d] text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}>
                <Link2 className="h-4 w-4" /> Connect Nodes
              </button>
              <button data-testid="add-objective-button" disabled={busy} onClick={() => setAddObjectiveOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-40">
                <Plus className="h-4 w-4" /> Add Objective
              </button>
            </>
          )}
          <button onClick={exportJson} className="flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      {error && <p role="alert" className="mx-4 mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p data-testid="map-notice" className="mx-4 mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">{message}</p>}

      {connectMode && (
        <div className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-white">
          <p className="text-sm">{pendingSource ? "Click the target objective to connect it." : "Pick a relationship type, then click a source objective."}</p>
          <div className="flex flex-wrap items-center gap-2">
            {SEMANTIC_LINK_TYPES.map((strength) => {
              const on = connectStrength === strength;
              return (
                <button key={strength} data-testid={`connect-strength-${strength}`} onClick={() => setConnectStrength(strength)} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: on ? "rgba(255,255,255,0.15)" : "transparent", boxShadow: on ? `inset 0 0 0 1px ${LINK_CONFIG[strength].color}` : undefined }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: LINK_CONFIG[strength].color }} />
                  {LINK_CONFIG[strength].label}
                </button>
              );
            })}
            <button onClick={() => { setConnectMode(false); setPendingSource(null); }} className="rounded-full p-1 hover:bg-white/10"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-[#f8fafc] px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search objectives..." className="w-52 rounded-xl border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
          </div>
          <button onClick={() => setPerspectiveFilter("all")} className={`rounded-xl px-3.5 py-2 text-xs font-semibold uppercase tracking-wide ${perspectiveFilter === "all" ? "bg-[#063b4d] text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>All</button>
          {sortedPerspectives.map((perspective, index) => {
            const Icon = perspectiveIcon(index);
            return (
              <button key={perspective.id} onClick={() => setPerspectiveFilter(perspectiveFilter === perspective.id ? "all" : perspective.id)} className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold uppercase tracking-wide ${perspectiveFilter === perspective.id ? "bg-[#063b4d] text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
                <Icon className="h-3.5 w-3.5" /> {compactPerspectiveName(perspective.nameEn, index)}
              </button>
            );
          })}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as PlacementStatus | "all")} className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 outline-none focus:border-indigo-500">
            <option value="all">All Status</option>
            {(Object.keys(STATUS_LABEL) as PlacementStatus[]).map((key) => <option key={key} value={key}>{STATUS_LABEL[key]}</option>)}
          </select>
          <button onClick={() => setDepsVisible((value) => !value)} className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium ${depsVisible ? "bg-[#063b4d] text-white" : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}>
            <Link2 className="h-3.5 w-3.5" /> Dependencies
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-gray-500">
          {SEMANTIC_LINK_TYPES.map((type) => <span key={type} className="flex items-center gap-1.5"><span className="h-px w-6 rounded-full" style={{ background: LINK_CONFIG[type].color }} /> {LINK_CONFIG[type].label}</span>)}
        </div>
      </div>

      <div className="relative bg-[#f8fafc]">
        <div className={`transition-[margin] duration-200 ${selectedPlacement ? "lg:mr-[320px]" : ""}`}>
          <StrategyMapFlowCanvas perspectives={perspectivesWithWeight} placements={filteredPlacements} links={filteredLinks} editing={!!draftMapId} selectedObjectiveId={selectedObjectiveId} onSelectObjective={handleObjectiveClick} onRemoveLink={isAnalyst ? (id) => void removeLink(id) : undefined} connecting={connectMode} pendingSourceId={pendingSource} infoLabel={infoCard} />
        </div>

        {selectedPlacement && (
          <aside data-testid="node-properties-panel" className="absolute inset-y-0 right-0 z-20 hidden w-[320px] overflow-y-auto border-l border-gray-200 bg-white shadow-sm lg:flex lg:flex-col">
            <div className="flex items-center justify-between px-4 py-3" style={{ background: panelColor.bandBg }}>
              {selectedPerspective ? <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: panelColor.textColor }}>{selectedPerspective.nameEn}</span> : <span />}
              <div className="flex items-center gap-1">
                {isSeoAdmin && selectedHierarchyNode && !isDemo && (
                  <>
                    <button title="Edit objective" onClick={() => setEditObjectiveOpen(true)} className="rounded-full p-1.5 text-gray-500 hover:bg-white/70"><Pencil className="h-3.5 w-3.5" /></button>
                    <button title="Delete objective" onClick={() => setDeleteObjectiveOpen(true)} className="rounded-full p-1.5 text-gray-500 hover:bg-white/70 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </>
                )}
                <button title="Close" onClick={() => setSelectedObjectiveId(null)} className="rounded-full p-1.5 text-gray-500 hover:bg-white/70"><X className="h-3.5 w-3.5" /></button>
              </div>
            </div>

            <div className="flex-1 space-y-5 p-4">
              <div>
                <h3 className="text-base font-semibold leading-6 text-gray-900">{selectedHierarchyNode?.name ?? selectedPlacement.objectiveNameEn}</h3>
                <div className="mt-2 flex items-center gap-2">
                  {panelStatus && <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: STATUS_PILL[panelStatus].bg, color: STATUS_PILL[panelStatus].text }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_DOT[panelStatus] }} />{STATUS_LABEL[panelStatus]}</span>}
                  <span className="text-xs font-medium text-gray-500">{Math.round(objectiveProgress)}%</span>
                </div>
              </div>

              <div className="flex items-center gap-4 rounded-xl bg-gray-50 p-3">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${panelColor.accent} ${Math.max(0, Math.min(100, objectiveProgress))}%, #e5e7eb 0)` }}>
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-white text-xs font-semibold text-gray-800">{Math.round(objectiveProgress)}%</div>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Completion</p>
                  <p className="truncate text-xs text-gray-500">{objectiveOwner}</p>
                  <p className="text-xs text-gray-400">{periodLabel(selectedHierarchyNode)}</p>
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">Description</p>
                <p className="mt-2 text-sm leading-6 text-gray-600">{selectedHierarchyNode?.description || "No description has been added for this objective."}</p>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">Linked KPIs</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {objectiveKpis.length > 0 ? objectiveKpis.map((kpi) => <span key={kpi} className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">{kpi}</span>) : <span className="text-xs text-gray-400">No KPI linked</span>}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">Connections ({selectedNodeLinks.length})</p>
                <div className="mt-2 space-y-2" data-testid="node-connections-list">
                  {selectedNodeLinks.map((link) => {
                    const outgoing = link.fromObjectiveId === selectedPlacement.objectiveNodeId;
                    const otherId = outgoing ? link.toObjectiveId : link.fromObjectiveId;
                    const config = LINK_CONFIG[link.strength];
                    return (
                      <button key={link.id} type="button" data-testid={`map-link-${link.id}`} onClick={() => selectConnectedObjective(otherId)} className="flex w-full items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2.5 text-left text-xs transition hover:bg-gray-100">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: config.color }} />
                          <span className="min-w-0">
                            <span className="block text-[10px] font-medium uppercase tracking-wide text-gray-400">{outgoing ? <><ArrowRight className="mr-1 inline h-3 w-3" />{config.label}</> : <><ArrowLeft className="mr-1 inline h-3 w-3" />{config.label}</>}</span>
                            <span className="block truncate font-medium text-gray-800">{objectiveNames.get(otherId) ?? otherId}</span>
                          </span>
                        </span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                      </button>
                    );
                  })}
                  {selectedNodeLinks.length === 0 && <p className="text-xs text-gray-400">No connections yet.</p>}
                </div>
              </div>
            </div>

            {(isSeoAdmin || isAnalyst) && !isDemo && (
              <div className="sticky bottom-0 grid grid-cols-2 gap-2 border-t border-gray-100 bg-white p-3">
                <button type="button" disabled={!isSeoAdmin || !selectedHierarchyNode} onClick={() => setEditObjectiveOpen(true)} className="flex items-center justify-center gap-1.5 rounded-full border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                <button type="button" disabled={!isAnalyst} onClick={() => startConnectFrom(selectedPlacement.objectiveNodeId)} className="flex items-center justify-center gap-1.5 rounded-full bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40"><Link2 className="h-3.5 w-3.5" /> Connect</button>
              </div>
            )}
          </aside>
        )}
      </div>

      {selectedPlacement && (
        <div data-testid="node-properties-panel-mobile" className="border-t border-gray-200 bg-white p-4 lg:hidden">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase text-gray-400">{selectedPerspective?.nameEn}</p><h3 className="mt-1 font-semibold text-gray-900">{selectedHierarchyNode?.name ?? selectedPlacement.objectiveNameEn}</h3></div>
            <button title="Close" onClick={() => setSelectedObjectiveId(null)} className="rounded-full p-1.5 text-gray-500"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {(isAnalyst && draftMapId) || submitted || isAnalyst ? (
        <div className="grid gap-3 border-t border-gray-200 bg-[#f8fafc] p-4 md:grid-cols-2">
          {isAnalyst && draftMapId && (
            <section className="rounded-2xl border bg-white p-4">
              <h2 className="mb-2 font-semibold">Submit draft for approval</h2>
              <div className="flex flex-col gap-2"><input data-testid="approval-participant-id" value={approverId} onChange={(e) => setApproverId(e.target.value)} placeholder="Approver user UUID" className="w-full rounded-lg border p-2 text-sm" /><button data-testid="submit-for-approval-button" disabled={busy || !draftMapId || !approverId.trim()} onClick={() => void submit()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Submit</button></div>
            </section>
          )}
          {submitted && <p data-testid="submitted-map-case" data-case-id={submitted.id} data-map-id={submitted.mapId} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Pending approval · {submitted.id}</p>}
          {isAnalyst && (
            <section data-testid="publish-approved-map" className="rounded-2xl border bg-white p-4">
              <h2 className="mb-2 font-semibold">Publish approved draft</h2>
              <div className="flex flex-col gap-2"><input data-testid="publish-map-id" value={publishMapId} onChange={(e) => setPublishMapId(e.target.value)} placeholder="Strategy map UUID" className="rounded-lg border p-2 text-sm" /><input data-testid="publish-case-id" value={publishCaseId} onChange={(e) => setPublishCaseId(e.target.value)} placeholder="Approved case UUID" className="rounded-lg border p-2 text-sm" /><button data-testid="publish-map-button" disabled={busy || !publishMapId.trim() || !publishCaseId.trim()} onClick={() => void publish()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Publish</button></div>
            </section>
          )}
        </div>
      ) : null}

      {addObjectiveOpen && <AddObjectiveModal objectives={eligibleObjectives} perspectives={scorecard.perspectives} busy={busy} onClose={() => setAddObjectiveOpen(false)} onAdd={addObjective} />}
      {newMapOpen && <NewMapModal busy={busy} onClose={() => setNewMapOpen(false)} onCreate={createMap} />}
      {editObjectiveOpen && selectedHierarchyNode && <EditObjectiveModal objective={{ id: selectedHierarchyNode.id, name: selectedHierarchyNode.name, status: selectedHierarchyNode.status, progress: selectedHierarchyNode.progress, ownerName: selectedHierarchyNode.owner.name, description: selectedHierarchyNode.description }} busy={busy} onClose={() => setEditObjectiveOpen(false)} onSave={saveObjective} />}
      {deleteObjectiveOpen && selectedHierarchyNode && <DeleteObjectiveModal objectiveName={selectedHierarchyNode.name} busy={busy} onCancel={() => setDeleteObjectiveOpen(false)} onDelete={confirmDeleteObjective} />}
    </div>
  );
}
