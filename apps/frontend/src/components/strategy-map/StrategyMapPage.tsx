"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Map as MapIcon, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

export default function StrategyMapPage() {
  const utils = trpc.useUtils();
  const plans = trpc.strategy.plans.useQuery();
  const nodes = trpc.strategy.nodes.useQuery();
  const [planId, setPlanId] = useState("");
  const selectedPlanId = planId || plans.data?.find((plan) => plan.status === "active")?.id || plans.data?.[0]?.id || "";
  const edges = trpc.strategy.edges.useQuery(
    { planVersionId: selectedPlanId || "00000000-0000-4000-8000-000000000000" },
    { enabled: Boolean(selectedPlanId) },
  );
  const planNodes = useMemo(() => nodes.data?.filter((node) => node.planVersionId === selectedPlanId) ?? [], [nodes.data, selectedPlanId]);
  const byId = useMemo(() => new Map(planNodes.map((node) => [node.id, node])), [planNodes]);

  const reload = async () => Promise.all([
    utils.strategy.nodes.invalidate(), utils.strategy.plans.invalidate(),
    selectedPlanId ? utils.strategy.edges.invalidate({ planVersionId: selectedPlanId }) : Promise.resolve(),
  ]);

  return <div className="space-y-5 p-4 sm:p-6" data-testid="persisted-strategy-map">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><MapIcon className="h-5 w-5" /> Strategy Map</h1><p className="text-sm text-slate-500">Persisted Strategy objectives and relationships</p></div><button onClick={() => void reload()} className="rounded border p-2"><RefreshCw className="h-4 w-4" /></button></div>
    <label className="block text-sm">Plan version<select value={selectedPlanId} onChange={(event) => setPlanId(event.target.value)} className="ml-2 rounded border p-2">{plans.data?.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.status}</option>)}</select></label>
    {nodes.error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{nodes.error.message}</p>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{planNodes.filter((node) => node.type === "objective" || node.type === "theme" || node.type === "strategic_play").map((node) => <article key={node.id} data-testid="persisted-map-node" className="rounded-xl border bg-white p-4"><p className="text-xs uppercase text-slate-400">{node.type}</p><h2 className="mt-1 font-semibold">{node.nameEn}</h2><p dir="rtl" className="text-sm text-slate-500">{node.nameAr}</p><div className="mt-3 space-y-1">{edges.data?.filter((edge) => edge.fromNodeId === node.id).map((edge) => <div key={edge.id} data-testid="persisted-map-edge" className="flex items-center gap-1 text-xs text-slate-600"><ArrowRight className="h-3 w-3" /> {edge.edgeType}: {byId.get(edge.toNodeId)?.nameEn ?? edge.toNodeId}</div>)}</div></article>)}{planNodes.length === 0 && <p className="text-sm text-slate-400">No persisted strategy data.</p>}</div>
  </div>;
}
