"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Network, Plus, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

type NodeType = "corporate_strategy" | "theme" | "objective" | "strategic_play" | "portfolio" | "area_of_focus";
type EdgeType = "contains" | "executed_by" | "belongs_to_portfolio" | "aligns_to";

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Strategy operation failed.";

export default function StrategyHierarchyPage() {
  const utils = trpc.useUtils();
  const plans = trpc.strategy.plans.useQuery();
  const nodes = trpc.strategy.nodes.useQuery();
  const [planId, setPlanId] = useState("");
  const selectedPlanId = planId || plans.data?.find((plan) => plan.status === "active")?.id || plans.data?.[0]?.id || "";
  const edges = trpc.strategy.edges.useQuery(
    { planVersionId: selectedPlanId || "00000000-0000-4000-8000-000000000000" },
    { enabled: Boolean(selectedPlanId) },
  );
  const staged = trpc.strategy.stagedChanges.useQuery(
    { planVersionId: selectedPlanId || "00000000-0000-4000-8000-000000000000" },
    { enabled: Boolean(selectedPlanId) },
  );
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const detail = trpc.strategy.node.useQuery(
    { nodeId: selectedNodeId || "00000000-0000-4000-8000-000000000000" },
    { enabled: Boolean(selectedNodeId) },
  );
  const trace = trpc.strategy.trace.useQuery(
    { nodeId: selectedNodeId || "00000000-0000-4000-8000-000000000000" },
    { enabled: Boolean(selectedNodeId) },
  );
  const [form, setForm] = useState({ type: "objective" as NodeType, nameEn: "", nameAr: "", parentId: "", edgeType: "contains" as EdgeType, approverId: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedPlan = plans.data?.find((plan) => plan.id === selectedPlanId);
  const planNodes = useMemo(() => nodes.data?.filter((node) => node.planVersionId === selectedPlanId) ?? [], [nodes.data, selectedPlanId]);

  const refresh = async () => Promise.all([
    utils.strategy.nodes.invalidate(), utils.strategy.plans.invalidate(),
    selectedPlanId ? utils.strategy.edges.invalidate({ planVersionId: selectedPlanId }) : Promise.resolve(),
    selectedPlanId ? utils.strategy.stagedChanges.invalidate({ planVersionId: selectedPlanId }) : Promise.resolve(),
    selectedNodeId ? utils.strategy.trace.invalidate({ nodeId: selectedNodeId }) : Promise.resolve(),
  ]);
  const createNode = trpc.strategy.createNode.useMutation();
  const linkEdge = trpc.strategy.linkEdge.useMutation();
  const submit = trpc.governance.submit.useMutation();

  const saveNode = async () => {
    setError(null);
    try {
      const active = selectedPlan?.status === "active";
      let approvalCaseId: string | undefined;
      let stagedChangeId: string | undefined;
      if (active) {
        stagedChangeId = crypto.randomUUID();
        const approval = await submit.mutateAsync({
          entityType: "StrategyStagedChange", entityId: stagedChangeId,
          approvalParticipantId: form.approverId,
          proposedChange: { before: {}, after: { type: form.type, nameEn: form.nameEn, nameAr: form.nameAr }, impactSummary: "Create strategy node" },
        });
        approvalCaseId = approval.id;
      }
      const created = await createNode.mutateAsync({
        type: form.type, nameEn: form.nameEn, nameAr: form.nameAr,
        planVersionId: selectedPlanId, ...(approvalCaseId ? { approvalCaseId, stagedChangeId } : {}),
      });
      if (form.parentId && "state" in created) {
        await linkEdge.mutateAsync({ fromNodeId: form.parentId, toNodeId: created.id, edgeType: form.edgeType, planVersionId: selectedPlanId });
      }
      setNotice(active ? "Structural change persisted and submitted for governed activation." : "Draft strategy node persisted.");
      setForm((current) => ({ ...current, nameEn: "", nameAr: "" }));
      await refresh();
    } catch (cause) { setError(errorMessage(cause)); }
  };

  return <div className="space-y-5 p-4 sm:p-6" data-testid="persisted-strategy-explorer">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Strategy Explorer</h1><p className="text-sm text-slate-500">Persisted hierarchy, traversal, and governed structural changes</p></div><button onClick={() => void refresh()} className="rounded border p-2"><RefreshCw className="h-4 w-4" /></button></div>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}{notice && <p className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <label className="block text-sm">Plan version<select value={selectedPlanId} onChange={(event) => { setPlanId(event.target.value); setSelectedNodeId(""); }} className="ml-2 rounded border p-2">{plans.data?.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.status}</option>)}</select></label>
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <section className="rounded-xl border bg-white p-4"><h2 className="mb-3 flex items-center gap-2 font-semibold"><Network className="h-4 w-4" /> Persisted hierarchy</h2>{planNodes.map((node) => { const parents = edges.data?.filter((edge) => edge.toNodeId === node.id) ?? []; return <button key={node.id} data-testid="persisted-strategy-node" onClick={() => setSelectedNodeId(node.id)} className="mb-2 block w-full rounded border p-3 text-left"><span className="font-medium">{node.nameEn}</span><span className="ml-2 text-xs text-slate-400">{node.type} · {node.state}</span>{parents.map((edge) => <span key={edge.id} className="mt-1 block text-xs text-slate-500"><ChevronRight className="inline h-3 w-3" /> parent {edge.fromNodeId} ({edge.edgeType})</span>)}</button>; })}{planNodes.length === 0 && <p className="text-sm text-slate-400">No persisted nodes in this plan.</p>}</section>
      <aside className="space-y-4"><div className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Node detail & traversal</h2>{detail.data ? <div className="mt-2 text-sm"><p>{detail.data.nameEn}</p><p dir="rtl">{detail.data.nameAr}</p><p className="mt-2 text-slate-500">Ancestry: {trace.data?.ancestry.map((item) => item.nameEn).join(" → ") || "root"}</p><p className="text-slate-500">Cascade: {trace.data?.cascade.length ?? 0} node(s)</p></div> : <p className="mt-2 text-sm text-slate-400">Select a node.</p>}</div><div className="rounded-xl border bg-white p-4"><h2 className="mb-2 font-semibold"><Plus className="inline h-4 w-4" /> Persist structural change</h2><div className="space-y-2"><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as NodeType })} className="w-full rounded border p-2 text-sm">{["corporate_strategy","theme","objective","strategic_play","portfolio","area_of_focus"].map((type) => <option key={type}>{type}</option>)}</select><input value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} placeholder="English name" className="w-full rounded border p-2 text-sm" /><input value={form.nameAr} onChange={(event) => setForm({ ...form, nameAr: event.target.value })} placeholder="Arabic name" className="w-full rounded border p-2 text-sm" />{selectedPlan?.status === "active" && <input value={form.approverId} onChange={(event) => setForm({ ...form, approverId: event.target.value })} placeholder="Different approver UUID" className="w-full rounded border p-2 text-sm" />}<button disabled={!form.nameEn || !form.nameAr || (selectedPlan?.status === "active" && !form.approverId)} onClick={() => void saveNode()} className="w-full rounded bg-slate-900 p-2 text-sm text-white disabled:opacity-40">{selectedPlan?.status === "active" ? "Stage & submit" : "Save draft"}</button></div></div></aside>
    </div>
    <section className="rounded-xl border bg-white p-4"><h2 className="mb-2 font-semibold">Staged changes</h2>{staged.data?.map((change) => <div key={change.id} data-testid="persisted-staged-change" className="border-t py-2 text-sm">{change.kind} · {change.status} · case {change.approvalCaseId}</div>)}{staged.data?.length === 0 && <p className="text-sm text-slate-400">No staged changes.</p>}</section>
  </div>;
}
