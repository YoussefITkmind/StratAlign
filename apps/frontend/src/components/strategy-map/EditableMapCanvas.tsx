"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, Background, BackgroundVariant, useNodesState, useEdgesState,
  type Node, type Edge, type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronLeft, Link2, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { Objective, DraftLink, LinkStrength } from "@/types/strategyMap";
import { initialMaps } from "@/data/mockMapData";
import { unplacedObjectivePool } from "@/data/mockUnplacedObjectives";
import { PERSPECTIVE_ORDER, PERSPECTIVE_CONFIG, LANE_HEIGHT, scoreStatus, STATUS_LABEL, STATUS_DOT } from "@/lib/mapConfig";
import { buildNodes, buildEdges } from "@/lib/buildFlow";
import { useI18n } from "@/lib/i18n/locale-context";
import LaneNode from "./LaneNode";
import ObjectiveNode from "./ObjectiveNode";
import DependencyEdge from "./DependencyEdge";
import DraftLinkEdge from "./DraftLinkEdge";
import EdgeMarkerDefs from "./EdgeMarkerDefs";
import ZoomControls from "./ZoomControls";

type ViewerRole = "read-only" | "strategy_analyst" | "governance_committee";
type MapStatus = "published" | "draft-pending-approval";

const nodeTypes = { lane: LaneNode, objective: ObjectiveNode };
const edgeTypes = { dependency: DependencyEdge, draft: DraftLinkEdge };
const STRENGTHS: LinkStrength[] = ["weak", "moderate", "strong"];

/**
 * Interactive strategy map canvas (screen 13) — view mode for everyone, edit
 * mode gated to a mock "strategy_analyst" role.
 *
 * FRONTEND-ONLY SHELL: Prompt 1.5's ApprovalCase workflow and Prompt 3.1's
 * DRAFT-map API don't exist in the backend yet, and role enforcement here is
 * a local dropdown, not a real session — nothing below is enforced
 * server-side. "Submit for approval" only flips local state; it does not
 * create a real ApprovalCase, and there is no second session that can approve
 * it. Treat this as UI/interaction scaffolding to wire up once that backend
 * work lands, not as a complete feature.
 */
export default function EditableMapCanvas({ mapId }: { mapId: string }) {
  const { t } = useI18n();
  const baseMap = useMemo(() => initialMaps.find((m) => m.id === mapId), [mapId]);
  const unplacedPool = useMemo(() => unplacedObjectivePool[mapId] ?? [], [mapId]);

  const [viewerRole, setViewerRole] = useState<ViewerRole>("read-only");
  const [editMode, setEditMode] = useState(false);
  const [mapStatus, setMapStatus] = useState<MapStatus>("published");

  const [draftObjectives, setDraftObjectives] = useState<Objective[]>([]);
  const [draftLinks, setDraftLinks] = useState<DraftLink[]>([]);
  const [removedDependencyIds, setRemovedDependencyIds] = useState<Set<string>>(new Set());

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawingLink, setDrawingLink] = useState(false);
  const [linkSource, setLinkSource] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const [strength, setStrength] = useState<LinkStrength>("moderate");
  const [addPickerOpen, setAddPickerOpen] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoomPct, setZoomPct] = useState(100);

  const canEnterEditMode = viewerRole === "strategy_analyst" && mapStatus === "published";
  const hasPendingChanges = draftObjectives.length > 0 || draftLinks.length > 0 || removedDependencyIds.size > 0;

  const allObjectives = useMemo(() => (baseMap ? [...baseMap.objectives, ...draftObjectives] : []), [baseMap, draftObjectives]);
  const selectedObjective = allObjectives.find((o) => o.id === selectedId) ?? null;

  const exitEditMode = () => {
    setEditMode(false);
    setDrawingLink(false);
    setLinkSource(null);
    setPendingTarget(null);
  };

  useEffect(() => {
    if (!baseMap) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    const contentHeight = PERSPECTIVE_ORDER.length * LANE_HEIGHT;
    const targetWidth = rect && rect.width > 0 && rect.height > 0 ? (rect.width / rect.height) * contentHeight : 0;

    setNodes(
      buildNodes(allObjectives, targetWidth).map((n) =>
        n.type === "objective" && draftObjectives.some((o) => o.id === n.id) ? { ...n, data: { ...n.data, draft: true } } : n
      )
    );

    const publishedEdges = buildEdges(baseMap.dependencies.filter((d) => !removedDependencyIds.has(d.id)));
    const proposedRemovalEdges: Edge[] = baseMap.dependencies
      .filter((d) => removedDependencyIds.has(d.id))
      .map((d) => ({ id: d.id, source: d.source, target: d.target, type: "draft", data: { strength: "moderate" as LinkStrength, removed: true } }));
    const newDraftEdges: Edge[] = draftLinks.map((l) => ({ id: l.id, source: l.source, target: l.target, type: "draft", data: { strength: l.strength } }));

    setEdges([...publishedEdges, ...proposedRemovalEdges, ...newDraftEdges]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseMap, allObjectives, draftLinks, removedDependencyIds]);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      if (node.type !== "objective") return;
      if (editMode && drawingLink) {
        if (!linkSource) {
          setLinkSource(node.id);
          return;
        }
        if (linkSource === node.id) {
          setLinkSource(null);
          return;
        }
        setPendingTarget(node.id);
        return;
      }
      setSelectedId(node.id);
    },
    [editMode, drawingLink, linkSource]
  );

  if (!baseMap) {
    return (
      <div data-testid="map-canvas-not-found" className="mx-auto max-w-[720px] p-6 text-center">
        <h1 className="text-lg font-semibold text-gray-900">{t("mapCanvas.notFoundTitle")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("mapCanvas.notFoundBody")}</p>
        <Link href="/strategy-maps" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700">
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {t("mapCanvas.backToMaps")}
        </Link>
      </div>
    );
  }

  const confirmLink = () => {
    if (!linkSource || !pendingTarget) return;
    setDraftLinks((prev) => [...prev, { id: `draft-link-${Date.now()}`, source: linkSource, target: pendingTarget, strength }]);
    setLinkSource(null);
    setPendingTarget(null);
    setDrawingLink(false);
  };

  const addObjectiveReference = (objective: Objective) => {
    setDraftObjectives((prev) => [...prev, objective]);
    setAddPickerOpen(false);
  };

  const removeDraftObjective = (id: string) => {
    setDraftObjectives((prev) => prev.filter((o) => o.id !== id));
    setDraftLinks((prev) => prev.filter((l) => l.source !== id && l.target !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const removeDraftLink = (id: string) => setDraftLinks((prev) => prev.filter((l) => l.id !== id));

  const toggleProposeRemoval = (id: string) => {
    setRemovedDependencyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitForApproval = () => {
    setMapStatus("draft-pending-approval");
    exitEditMode();
  };

  const discardDraft = () => {
    setDraftObjectives([]);
    setDraftLinks([]);
    setRemovedDependencyIds(new Set());
    setMapStatus("published");
  };

  const placedIds = new Set(allObjectives.map((o) => o.id));
  const availableToAdd = unplacedPool.filter((o) => !placedIds.has(o.id));

  return (
    <div data-testid="map-canvas-page" className="mx-auto max-w-[1600px] p-4 sm:p-6">
      <Link href="/strategy-maps" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700">
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {t("mapCanvas.backToMaps")}
      </Link>

      <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-bold text-gray-900">{baseMap.name}</h1>
            <span
              data-testid="map-status-badge"
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${mapStatus === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
            >
              {mapStatus === "published" ? t("mapCanvas.statusPublished") : t("mapCanvas.statusDraftPending")}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-gray-500">{baseMap.period}</p>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="viewer-role" className="text-xs font-medium text-gray-500">
              {t("mapCanvas.viewingAs")}
            </label>
            <select
              id="viewer-role"
              data-testid="viewer-role-select"
              value={viewerRole}
              onChange={(e) => {
                setViewerRole(e.target.value as ViewerRole);
                exitEditMode();
              }}
              className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 outline-none focus:border-indigo-500"
            >
              <option value="read-only">{t("mapCanvas.roleReadOnly")}</option>
              <option value="strategy_analyst">{t("mapCanvas.roleAnalyst")}</option>
              <option value="governance_committee">{t("mapCanvas.roleGovernance")}</option>
            </select>
            <button
              type="button"
              disabled={!canEnterEditMode}
              onClick={() => (editMode ? exitEditMode() : setEditMode(true))}
              data-testid="edit-mode-toggle"
              className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                editMode ? "border-slate-900 bg-slate-900 text-white" : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Pencil className="h-3.5 w-3.5" /> {t("mapCanvas.editMode")}
            </button>
          </div>
          <p className="max-w-xs text-end text-[11px] leading-snug text-gray-400">{t("mapCanvas.mockRoleNotice")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div ref={canvasRef} className="relative h-[65vh] min-h-[520px] w-full overflow-hidden rounded-xl border border-gray-200">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            onMove={(_, viewport) => setZoomPct(Math.round(viewport.zoom * 100))}
            nodesDraggable={false}
            nodesConnectable={false}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.4}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
            className="bg-[#fafbfc]"
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#e2e8f0" />
            <ZoomControls zoomPct={zoomPct} />
          </ReactFlow>
          <EdgeMarkerDefs />
        </div>

        <div data-testid="map-side-panel" className="flex flex-col gap-4">
          {mapStatus === "draft-pending-approval" && (
            <div data-testid="draft-banner" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
              {t("mapCanvas.submittedBanner")}
            </div>
          )}

          <div data-testid="node-properties-panel" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-gray-800">{t("mapCanvas.propertiesTitle")}</h2>
            {selectedObjective ? (
              <div className="flex flex-col gap-2 text-sm">
                <p className="font-medium text-gray-900">{selectedObjective.title}</p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{t("mapCanvas.propertiesPerspective")}</span>
                  <span className="font-medium text-gray-700">{PERSPECTIVE_CONFIG[selectedObjective.perspective].label}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{t("mapCanvas.propertiesOwner")}</span>
                  <span className="font-medium text-gray-700">{selectedObjective.owner}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{t("mapCanvas.propertiesScore")}</span>
                  <span className="flex items-center gap-1.5 font-medium text-gray-700">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_DOT[scoreStatus(selectedObjective.score)] }} />
                    {selectedObjective.score}% · {STATUS_LABEL[scoreStatus(selectedObjective.score)]}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{t("mapCanvas.propertiesKpis")}</span>
                  <span className="font-medium text-gray-400">{t("mapCanvas.notTracked")}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{t("mapCanvas.propertiesInitiatives")}</span>
                  <span className="font-medium text-gray-400">{t("mapCanvas.initiativesPlaceholder")}</span>
                </div>
                {editMode && draftObjectives.some((o) => o.id === selectedObjective.id) && (
                  <button
                    type="button"
                    onClick={() => removeDraftObjective(selectedObjective.id)}
                    className="mt-1 flex items-center gap-1.5 self-start text-xs font-medium text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {t("mapCanvas.removeFromMap")}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400">{t("mapCanvas.selectNodeHint")}</p>
            )}
          </div>

          {editMode && (
            <div data-testid="edit-toolbar" className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-800">{t("mapCanvas.pendingChanges")}</h2>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setAddPickerOpen((v) => !v)}
                  data-testid="add-objective-reference-button"
                  className="flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Plus className="h-3.5 w-3.5" /> {t("mapCanvas.addObjectiveReference")}
                </button>
                {addPickerOpen && (
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-2">
                    {availableToAdd.length === 0 ? (
                      <p className="p-1 text-xs text-gray-400">{t("mapCanvas.noObjectivesToAdd")}</p>
                    ) : (
                      availableToAdd.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => addObjectiveReference(o)}
                          data-testid={`unplaced-objective-${o.id}`}
                          className="block w-full rounded-md px-2 py-1.5 text-start text-xs text-gray-700 hover:bg-white"
                        >
                          {o.title}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {!drawingLink ? (
                  <button
                    type="button"
                    onClick={() => setDrawingLink(true)}
                    data-testid="draw-link-button"
                    className="flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Link2 className="h-3.5 w-3.5" /> {t("mapCanvas.drawLink")}
                  </button>
                ) : (
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-2 text-xs">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-gray-500">{pendingTarget ? t("mapCanvas.strengthLabel") : t("mapCanvas.pickTarget")}</span>
                      <button type="button" onClick={() => { setDrawingLink(false); setLinkSource(null); setPendingTarget(null); }}>
                        <X className="h-3.5 w-3.5 text-gray-400" />
                      </button>
                    </div>
                    {pendingTarget && (
                      <div className="flex items-center gap-2">
                        <select
                          value={strength}
                          onChange={(e) => setStrength(e.target.value as LinkStrength)}
                          data-testid="link-strength-select"
                          className="rounded-full border border-gray-300 px-2 py-1 text-xs outline-none focus:border-indigo-500"
                        >
                          {STRENGTHS.map((s) => (
                            <option key={s} value={s}>
                              {t(`mapCanvas.strength${s.charAt(0).toUpperCase()}${s.slice(1)}`)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={confirmLink}
                          data-testid="confirm-link-button"
                          className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800"
                        >
                          {t("mapCanvas.confirmLink")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div data-testid="pending-changes-list" className="flex flex-col gap-1.5 border-t border-gray-100 pt-3">
                {!hasPendingChanges && <p className="text-xs text-gray-400">{t("mapCanvas.noPendingChanges")}</p>}
                {draftObjectives.map((o) => (
                  <div key={o.id} className="flex items-center justify-between rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-800">
                    <span className="truncate">{t("mapCanvas.addedObjective")}: {o.title}</span>
                    <button type="button" onClick={() => removeDraftObjective(o.id)}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {draftLinks.map((l) => (
                  <div key={l.id} className="flex items-center justify-between rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-800">
                    <span className="truncate">{t("mapCanvas.addedLink")}: {l.strength}</span>
                    <button type="button" onClick={() => removeDraftLink(l.id)}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {baseMap.dependencies
                  .filter((d) => removedDependencyIds.has(d.id))
                  .map((d) => (
                    <div key={d.id} className="flex items-center justify-between rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
                      <span className="truncate">{t("mapCanvas.proposedRemoval")}</span>
                      <button type="button" onClick={() => toggleProposeRemoval(d.id)} className="text-[10px] font-semibold underline">
                        {t("mapCanvas.undo")}
                      </button>
                    </div>
                  ))}
                {baseMap.dependencies
                  .filter((d) => !removedDependencyIds.has(d.id))
                  .map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleProposeRemoval(d.id)}
                      data-testid={`propose-removal-${d.id}`}
                      className="flex items-center justify-between rounded-md px-2 py-1 text-start text-[11px] text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                    >
                      <span className="truncate">{d.source} → {d.target}</span>
                      <span className="shrink-0 underline">{t("mapCanvas.proposeRemoval")}</span>
                    </button>
                  ))}
              </div>

              <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
                <button
                  type="button"
                  disabled={!hasPendingChanges}
                  onClick={submitForApproval}
                  data-testid="submit-for-approval-button"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send className="h-3.5 w-3.5" /> {t("mapCanvas.submitForApproval")}
                </button>
                <button
                  type="button"
                  disabled={!hasPendingChanges}
                  onClick={discardDraft}
                  data-testid="discard-draft-button"
                  className="rounded-full border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t("mapCanvas.discardDraft")}
                </button>
              </div>
              <p className="text-[11px] leading-relaxed text-gray-400">{t("mapCanvas.draftBanner")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
