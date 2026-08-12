"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, Background, BackgroundVariant, useNodesState, useEdgesState,
  type Node, type Edge, type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronLeft, Link2, Send, Trash2, X } from "lucide-react";
import { Objective } from "@/types/strategyMap";
import { PERSPECTIVE_ORDER, LANE_HEIGHT } from "@/lib/mapConfig";
import { buildNodes } from "@/lib/buildFlow";
import { trpc } from "@/lib/trpc/client";
import { useI18n } from "@/lib/i18n/locale-context";
import LaneNode from "./LaneNode";
import ObjectiveNode from "./ObjectiveNode";
import DraftLinkEdge from "./DraftLinkEdge";
import EdgeMarkerDefs from "./EdgeMarkerDefs";
import ZoomControls from "./ZoomControls";

type LinkStrength = "weak" | "strong";
interface LinkRow { id: string; fromObjectiveId: string; toObjectiveId: string; strength: LinkStrength }
interface Perspective { id: string; nameEn: string; nameAr: string; order: number }
interface ScorecardDetail {
  id: string; nameEn: string; nameAr: string; planVersionId: string;
  perspectives: Perspective[];
  publishedMap: { id: string; state: "draft" | "published"; links: LinkRow[] } | null;
}
interface Placement {
  perspectiveId: string; objectiveNodeId: string; objectiveNameEn: string; objectiveNameAr: string;
  kpiNameEn: string | null; status: "on_track" | "watch" | "off_track" | null;
}
const EMPTY_PLACEMENTS: Placement[] = [];
const STATUS_SCORE: Record<string, number> = { on_track: 90, watch: 50, off_track: 15 };
const STATUS_LABEL_EN: Record<string, string> = { on_track: "On Track", watch: "Watch", off_track: "Off Track" };

const nodeTypes = { lane: LaneNode, objective: ObjectiveNode };
const edgeTypes = { draft: DraftLinkEdge };
const STRENGTHS: LinkStrength[] = ["weak", "strong"];

/**
 * Interactive strategy map canvas (screen 13) — real data (Prompt 3.1
 * scorecard.map API), real session roles, and a real governance ApprovalCase
 * for the submit -> approve -> publish flow. Edit mode is only reachable for
 * a real "strategy_analyst" role grant (checked server-side by every
 * scorecard.map.* mutation, not merely hidden here), and the published map
 * this renders in view mode is the same one Master Scorecard's map toggle
 * reads (scorecard.get.publishedMap).
 */
export default function EditableMapCanvas({ scorecardId, roles }: { scorecardId: string; roles: string[] }) {
  const { t } = useI18n();
  const isAnalyst = roles.includes("strategy_analyst");
  const utils = trpc.useUtils();

  const scorecardQuery = trpc.scorecard.get.useQuery({ scorecardId });
  const placementsQuery = trpc.scorecard.placement.list.useQuery({ scorecardId });
  const scorecard = scorecardQuery.data as ScorecardDetail | undefined;
  const placements = (placementsQuery.data as Placement[] | undefined) ?? EMPTY_PLACEMENTS;

  const [editMode, setEditMode] = useState(false);
  const [draftMapId, setDraftMapId] = useState<string | null>(null);
  const [draftLinks, setDraftLinks] = useState<LinkRow[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawingLink, setDrawingLink] = useState(false);
  const [linkSource, setLinkSource] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const [strength, setStrength] = useState<LinkStrength>("strong");

  const [approverUserId, setApproverUserId] = useState("");
  const [proposedCase, setProposedCase] = useState<{ id: string; mapId: string } | null>(null);

  const [publishMapId, setPublishMapId] = useState("");
  const [publishCaseId, setPublishCaseId] = useState("");
  const [publishNotice, setPublishNotice] = useState<string | null>(null);

  const draftLink = trpc.scorecard.map.draftLink.useMutation();
  const removeLink = trpc.scorecard.map.removeLink.useMutation();
  const propose = trpc.scorecard.map.propose.useMutation();
  const publish = trpc.scorecard.map.publish.useMutation();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoomPct, setZoomPct] = useState(100);

  const perspectives = useMemo(() => [...(scorecard?.perspectives ?? [])].sort((a, b) => a.order - b.order), [scorecard]);
  const laneKeyByPerspective = useMemo(() => {
    const map = new Map<string, (typeof PERSPECTIVE_ORDER)[number]>();
    perspectives.forEach((p, i) => map.set(p.id, PERSPECTIVE_ORDER[i % PERSPECTIVE_ORDER.length]));
    return map;
  }, [perspectives]);

  const objectives: Objective[] = useMemo(() => {
    const byPerspective = new Map<string, Placement[]>();
    for (const placement of placements) {
      const list = byPerspective.get(placement.perspectiveId) ?? [];
      list.push(placement);
      byPerspective.set(placement.perspectiveId, list);
    }
    return placements.map((placement) => {
      const column = (byPerspective.get(placement.perspectiveId) ?? []).findIndex((p) => p.objectiveNodeId === placement.objectiveNodeId);
      return {
        id: placement.objectiveNodeId,
        title: placement.objectiveNameEn,
        perspective: laneKeyByPerspective.get(placement.perspectiveId) ?? PERSPECTIVE_ORDER[0],
        owner: placement.kpiNameEn ?? "",
        score: placement.status ? STATUS_SCORE[placement.status] : 0,
        column: Math.max(column, 0),
      };
    });
  }, [placements, laneKeyByPerspective]);

  const statusLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const placement of placements) map.set(placement.objectiveNodeId, placement.status ? STATUS_LABEL_EN[placement.status] : "No computed status");
    return map;
  }, [placements]);

  const selectedObjective = objectives.find((o) => o.id === selectedId) ?? null;
  const linksToShow = editMode ? draftLinks : scorecard?.publishedMap?.links ?? [];

  useEffect(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const contentHeight = PERSPECTIVE_ORDER.length * LANE_HEIGHT;
    const targetWidth = rect && rect.width > 0 && rect.height > 0 ? (rect.width / rect.height) * contentHeight : 0;

    const builtNodes = buildNodes(objectives, targetWidth).map((n) => {
      if (n.type === "lane") {
        const perspective = perspectives.find((p) => laneKeyByPerspective.get(p.id) === (n.data as { perspective: string }).perspective);
        return perspective ? { ...n, data: { ...n.data, label: perspective.nameEn, weightLabel: undefined } } : n;
      }
      if (n.type === "objective") return { ...n, data: { ...n.data, statusLabel: statusLabelById.get(n.id) } };
      return n;
    });
    setNodes(builtNodes);

    setEdges(
      linksToShow.map((link) => ({
        id: link.id,
        source: link.fromObjectiveId,
        target: link.toObjectiveId,
        type: "draft",
        data: { strength: link.strength, published: !editMode },
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectives, perspectives, linksToShow, editMode]);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      if (node.type !== "objective") return;
      if (editMode && drawingLink) {
        if (!linkSource) { setLinkSource(node.id); return; }
        if (linkSource === node.id) { setLinkSource(null); return; }
        setPendingTarget(node.id);
        return;
      }
      setSelectedId(node.id);
    },
    [editMode, drawingLink, linkSource]
  );

  if (scorecardQuery.isLoading || placementsQuery.isLoading) {
    return <p className="p-8 text-sm text-gray-500">{t("common.loading")}</p>;
  }
  if (scorecardQuery.error || !scorecard) {
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

  const enterEditMode = async () => {
    setActionError(null);
    if (draftMapId) { setEditMode(true); return; }
    const published = scorecard.publishedMap?.links ?? [];
    if (published.length === 0) { setEditMode(true); return; }
    setSeeding(true);
    try {
      let mapId: string | undefined;
      const seeded: LinkRow[] = [];
      for (const link of published) {
        const result = await draftLink.mutateAsync({
          scorecardId, strategyMapId: mapId,
          link: { fromObjectiveId: link.fromObjectiveId, toObjectiveId: link.toObjectiveId, strength: link.strength },
        });
        const typed = result as { map: { id: string }; link: LinkRow };
        mapId = typed.map.id;
        seeded.push(typed.link);
      }
      setDraftMapId(mapId ?? null);
      setDraftLinks(seeded);
      setEditMode(true);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not start a draft");
    } finally {
      setSeeding(false);
    }
  };

  const exitEditMode = () => {
    setEditMode(false);
    setDrawingLink(false);
    setLinkSource(null);
    setPendingTarget(null);
  };

  const confirmLink = async () => {
    if (!linkSource || !pendingTarget) return;
    setActionError(null);
    try {
      const result = await draftLink.mutateAsync({
        scorecardId, strategyMapId: draftMapId ?? undefined,
        link: { fromObjectiveId: linkSource, toObjectiveId: pendingTarget, strength },
      });
      const typed = result as { map: { id: string }; link: LinkRow };
      setDraftMapId(typed.map.id);
      setDraftLinks((prev) => [...prev, typed.link]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not add that link");
    }
    setLinkSource(null);
    setPendingTarget(null);
    setDrawingLink(false);
  };

  const removeDraftLink = async (linkId: string) => {
    if (!draftMapId) return;
    setActionError(null);
    try {
      await removeLink.mutateAsync({ strategyMapId: draftMapId, linkId });
      setDraftLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not remove that link");
    }
  };

  const discardDraft = async () => {
    if (draftMapId) {
      await Promise.all(draftLinks.map((l) => removeLink.mutateAsync({ strategyMapId: draftMapId, linkId: l.id }).catch(() => undefined)));
    }
    setDraftLinks([]);
    setDraftMapId(null);
    exitEditMode();
  };

  const submitForApproval = async () => {
    if (!draftMapId || !approverUserId.trim()) return;
    setActionError(null);
    try {
      const result = await propose.mutateAsync({ strategyMapId: draftMapId, approvalParticipantId: approverUserId.trim() });
      const typed = result as { id: string };
      setProposedCase({ id: typed.id, mapId: draftMapId });
      setPublishMapId(draftMapId);
      exitEditMode();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not submit for approval");
    }
  };

  const publishApprovedMap = async () => {
    if (!publishMapId.trim() || !publishCaseId.trim()) return;
    setPublishNotice(null);
    setActionError(null);
    try {
      await publish.mutateAsync({ strategyMapId: publishMapId.trim(), approvalCaseId: publishCaseId.trim() });
      setPublishNotice("Published strategy map change.");
      setDraftMapId(null);
      setDraftLinks([]);
      setProposedCase(null);
      await utils.scorecard.get.invalidate({ scorecardId });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not publish that map");
    }
  };

  const hasPendingChanges = draftLinks.length > 0;

  return (
    <div data-testid="map-canvas-page" className="mx-auto max-w-[1600px] p-4 sm:p-6">
      <Link href="/strategy-maps" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700">
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {t("mapCanvas.backToMaps")}
      </Link>

      <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-bold text-gray-900">{scorecard.nameEn}</h1>
            <span
              data-testid="map-status-badge"
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${scorecard.publishedMap ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}
            >
              {scorecard.publishedMap ? t("mapCanvas.statusPublished") : "No published map yet"}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span data-testid="viewer-role-label" className="text-xs font-medium text-gray-500">
              {isAnalyst ? "Strategy analyst" : "Read-only viewer"}
            </span>
            <button
              type="button"
              disabled={!isAnalyst || seeding}
              onClick={() => (editMode ? exitEditMode() : void enterEditMode())}
              data-testid="edit-mode-toggle"
              className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                editMode ? "border-slate-900 bg-slate-900 text-white" : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {seeding ? "Loading…" : t("mapCanvas.editMode")}
            </button>
          </div>
        </div>
      </div>

      {actionError && <p role="alert" data-testid="map-action-error" className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{actionError}</p>}
      {publishNotice && <p data-testid="map-publish-notice" className="mb-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">{publishNotice}</p>}

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
          <div data-testid="node-properties-panel" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-gray-800">{t("mapCanvas.propertiesTitle")}</h2>
            {selectedObjective ? (
              <div className="flex flex-col gap-2 text-sm">
                <p className="font-medium text-gray-900">{selectedObjective.title}</p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{t("mapCanvas.propertiesKpis")}</span>
                  <span className="font-medium text-gray-700">{selectedObjective.owner || t("mapCanvas.notTracked")}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{t("mapCanvas.propertiesInitiatives")}</span>
                  <span className="font-medium text-gray-400">{t("mapCanvas.initiativesPlaceholder")}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400">{t("mapCanvas.selectNodeHint")}</p>
            )}
          </div>

          {editMode && (
            <div data-testid="edit-toolbar" className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-800">{t("mapCanvas.pendingChanges")}</h2>

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
                            <option key={s} value={s}>{t(`mapCanvas.strength${s.charAt(0).toUpperCase()}${s.slice(1)}`)}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void confirmLink()}
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
                {draftLinks.map((l) => (
                  <div key={l.id} className="flex items-center justify-between rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-800">
                    <span className="truncate">{t("mapCanvas.addedLink")}: {l.strength}</span>
                    <button type="button" onClick={() => void removeDraftLink(l.id)} data-testid={`remove-draft-link-${l.id}`}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>

              <label className="flex flex-col gap-1 text-xs text-gray-600">
                Different approver user UUID
                <input
                  value={approverUserId}
                  onChange={(e) => setApproverUserId(e.target.value)}
                  placeholder="Different approver UUID"
                  data-testid="approver-user-id-input"
                  className="rounded border border-gray-300 px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
                />
              </label>

              <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
                <button
                  type="button"
                  disabled={!hasPendingChanges || !approverUserId.trim() || propose.isPending}
                  onClick={() => void submitForApproval()}
                  data-testid="submit-for-approval-button"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send className="h-3.5 w-3.5" /> {t("mapCanvas.submitForApproval")}
                </button>
                <button
                  type="button"
                  disabled={!hasPendingChanges}
                  onClick={() => void discardDraft()}
                  data-testid="discard-draft-button"
                  className="rounded-full border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t("mapCanvas.discardDraft")}
                </button>
              </div>
            </div>
          )}

          {proposedCase && (
            <div data-testid="proposed-case-banner" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
              Submitted for approval. Case: {proposedCase.id}
              <br />
              <Link href={`/approvals/${proposedCase.id}`} className="font-medium underline">Review case</Link>
            </div>
          )}

          {isAnalyst && (
            <div data-testid="publish-panel" className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-800">Publish an approved map change</h2>
              <label className="flex flex-col gap-1 text-xs text-gray-600">
                Draft map UUID
                <input value={publishMapId} onChange={(e) => setPublishMapId(e.target.value)} placeholder="Draft map UUID"
                  data-testid="publish-map-id-input" className="rounded border border-gray-300 px-2 py-1.5 text-xs outline-none focus:border-indigo-500" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-gray-600">
                Approved case UUID
                <input value={publishCaseId} onChange={(e) => setPublishCaseId(e.target.value)} placeholder="Approved case UUID"
                  data-testid="publish-case-id-input" className="rounded border border-gray-300 px-2 py-1.5 text-xs outline-none focus:border-indigo-500" />
              </label>
              <button
                type="button"
                disabled={!publishMapId.trim() || !publishCaseId.trim() || publish.isPending}
                onClick={() => void publishApprovedMap()}
                data-testid="publish-map-button"
                className="rounded-full bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Publish
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
