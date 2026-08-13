"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import MapLanes, { type MapPlacement } from "./MapLanes";
import MapLinks, { type MapLinkRow } from "./MapLinks";
import ObjectivePlacementControls from "./ObjectivePlacementControls";
import LinkEditControls from "./LinkEditControls";
import { draftMapLink, getMapAuthorization, placeObjective, proposeMap, publishMap, removeMapLink } from "@/app/(app)/strategy-maps/actions";

interface Perspective { id: string; nameEn: string; nameAr: string; order: number }
interface ScorecardDetail {
  id: string; nameEn: string; nameAr: string; planVersionId: string;
  perspectives: Perspective[];
  publishedMap: { id: string; links: MapLinkRow[] } | null;
}
interface StrategyNode { id: string; type: string; nameEn: string; planVersionId: string; state?: string }

export default function StrategyMapCanvas({ scorecardId }: { scorecardId: string }) {
  const utils = trpc.useUtils();
  const scorecardQuery = trpc.scorecard.get.useQuery({ scorecardId });
  const placementsQuery = trpc.scorecard.placement.list.useQuery({ scorecardId });
  const nodesQuery = trpc.strategy.nodes.useQuery();
  const scorecard = scorecardQuery.data as ScorecardDetail | undefined;
  const placements = (placementsQuery.data as MapPlacement[] | undefined) ?? [];
  const strategyNodes = (nodesQuery.data as StrategyNode[] | undefined) ?? [];

  const [roles, setRoles] = useState<string[]>([]);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draftMapId, setDraftMapId] = useState<string | null>(null);
  const [draftLinks, setDraftLinks] = useState<MapLinkRow[]>([]);
  const [approverId, setApproverId] = useState("");
  const [publishMapId, setPublishMapId] = useState("");
  const [publishCaseId, setPublishCaseId] = useState("");
  const [submitted, setSubmitted] = useState<{ id: string; mapId: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getMapAuthorization().then((result) => setRoles(result.roles)).catch(() => setRoles([])).finally(() => setAuthLoaded(true));
  }, []);

  const isAnalyst = roles.includes("strategy_analyst");
  const placedIds = useMemo(() => new Set(placements.map((item) => item.objectiveNodeId)), [placements]);
  const eligibleObjectives = useMemo(() => strategyNodes.filter((node) =>
    node.type.toLowerCase() === "objective" && node.planVersionId === scorecard?.planVersionId && !placedIds.has(node.id) &&
    (!node.state || node.state.toLowerCase() === "active")), [strategyNodes, scorecard?.planVersionId, placedIds]);
  const objectiveNames = useMemo(() => new Map(placements.map((item) => [item.objectiveNodeId, item.objectiveNameEn])), [placements]);
  const visibleLinks = editing && draftMapId ? draftLinks : (scorecard?.publishedMap?.links ?? []);

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

  const removeLink = (linkId: string) => run(async () => {
    if (!draftMapId) return;
    await removeMapLink({ strategyMapId: draftMapId, linkId });
    setDraftLinks((current) => current.filter((link) => link.id !== linkId));
  });

  const submit = () => run(async () => {
    if (!draftMapId || !approverId.trim()) return;
    const result = await proposeMap({ strategyMapId: draftMapId, approvalParticipantId: approverId.trim() }) as { id: string };
    setSubmitted({ id: result.id, mapId: draftMapId }); setPublishMapId(draftMapId); setEditing(false);
    setMessage("Strategy map submitted for approval.");
  });

  const publish = () => run(async () => {
    if (!publishMapId.trim() || !publishCaseId.trim()) return;
    await publishMap({ strategyMapId: publishMapId.trim(), approvalCaseId: publishCaseId.trim() });
    await utils.scorecard.get.invalidate({ scorecardId });
    setDraftMapId(null); setDraftLinks([]); setSubmitted(null); setMessage("Approved strategy map published.");
  });

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 sm:p-6" data-testid="map-canvas-page">
      <Link href="/strategy-maps" className="inline-flex items-center gap-1 text-sm text-gray-500"><ChevronLeft className="h-4 w-4 rtl:rotate-180" /> Back to Strategy Maps</Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="flex items-center gap-2"><h1 className="text-2xl font-bold">{scorecard.nameEn}</h1><span data-testid="map-status-badge" className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{scorecard.publishedMap ? "Published" : "No published map"}</span></div><p dir="rtl" className="text-sm text-gray-500">{scorecard.nameAr}</p></div>
        <div className="flex items-center gap-2"><span data-testid="viewer-role-label" className="text-xs text-gray-500">{isAnalyst ? "Strategy analyst" : "Read-only viewer"}</span><button data-testid="edit-mode-toggle" disabled={!isAnalyst || busy} onClick={() => setEditing((value) => !value)} className="rounded-full border px-4 py-2 text-sm disabled:opacity-40">{editing ? "Exit edit mode" : "Edit map"}</button></div>
      </header>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p data-testid="map-notice" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">{message}</p>}

      <MapLanes perspectives={scorecard.perspectives} placements={placements} />
      <MapLinks links={visibleLinks} objectiveName={(id) => objectiveNames.get(id) ?? id} editable={editing && !!draftMapId} onRemove={(id) => void removeLink(id)} />

      {editing && isAnalyst && <div className="grid gap-4 lg:grid-cols-2" data-testid="edit-toolbar">
        <ObjectivePlacementControls objectives={eligibleObjectives} perspectives={scorecard.perspectives} busy={busy} onAdd={addObjective} />
        <LinkEditControls placements={placements} busy={busy} onAdd={addLink} />
        <section className="rounded-2xl border bg-white p-4 lg:col-span-2"><h2 className="mb-2 font-semibold">Submit draft for approval</h2><div className="flex gap-2"><input data-testid="approval-participant-id" value={approverId} onChange={(e) => setApproverId(e.target.value)} placeholder="Approver user UUID" className="min-w-0 flex-1 rounded-lg border p-2 text-sm" /><button data-testid="submit-for-approval-button" disabled={busy || !draftMapId || !approverId.trim()} onClick={() => void submit()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Submit</button></div></section>
      </div>}

      {submitted && <p data-testid="submitted-map-case" data-case-id={submitted.id} data-map-id={submitted.mapId} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Pending approval · {submitted.id}</p>}
      {isAnalyst && <section data-testid="publish-approved-map" className="rounded-2xl border bg-white p-4"><h2 className="mb-2 font-semibold">Publish approved draft</h2><div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"><input data-testid="publish-map-id" value={publishMapId} onChange={(e) => setPublishMapId(e.target.value)} placeholder="Strategy map UUID" className="rounded-lg border p-2 text-sm" /><input data-testid="publish-case-id" value={publishCaseId} onChange={(e) => setPublishCaseId(e.target.value)} placeholder="Approved case UUID" className="rounded-lg border p-2 text-sm" /><button data-testid="publish-map-button" disabled={busy || !publishMapId.trim() || !publishCaseId.trim()} onClick={() => void publish()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Publish</button></div></section>}
    </div>
  );
}
