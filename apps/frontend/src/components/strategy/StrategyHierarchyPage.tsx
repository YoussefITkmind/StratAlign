"use client";

import { useMemo, useState } from "react";
import { Search, Download, Maximize2, Minimize2, LayoutList, Network, Plus, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { NODE_TYPES, TYPE_CONFIG, STATE_CONFIG, type NodeType, type NodeState, type EdgeType } from "@/lib/strategyHierarchyConfig";
import { buildForest, filterForest, flatten, collectIds, isFiltering, type Filters } from "@/lib/strategyTreeUtils";
import TreeRow from "./TreeRow";

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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedPlan = plans.data?.find((plan) => plan.id === selectedPlanId);
  const planNodes = useMemo(() => nodes.data?.filter((node) => node.planVersionId === selectedPlanId) ?? [], [nodes.data, selectedPlanId]);
  const planEdges = useMemo(() => edges.data ?? [], [edges.data]);

  const [view, setView] = useState<"tree" | "list">("tree");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>({ search: "", type: "all", state: "all" });
  const [form, setForm] = useState({ type: "objective" as NodeType, nameEn: "", nameAr: "", parentId: "", edgeType: "contains" as EdgeType, approverId: "" });

  const forest = useMemo(
    () => buildForest(planNodes.map((node) => ({ id: node.id, type: node.type as NodeType, nameEn: node.nameEn, nameAr: node.nameAr, state: (node.state ?? "draft") as NodeState })), planEdges),
    [planNodes, planEdges],
  );
  const filteredForest = useMemo(() => filterForest(forest, filters), [forest, filters]);
  const filtering = isFiltering(filters);
  const allIds = useMemo(() => forest.flatMap(collectIds), [forest]);
  const listRows = useMemo(() => filteredForest.flatMap((root) => flatten(root)), [filteredForest]);
  const parentOptions = useMemo(() => forest.flatMap((root) => flatten(root)).map(({ node, depth }) => ({ id: node.id, nameEn: node.nameEn, depth })), [forest]);

  const toggle = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const expandAll = () => setExpandedIds(new Set(allIds));
  const collapseAll = () => setExpandedIds(new Set());

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ nodes: planNodes, edges: planEdges }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "strategy-hierarchy.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const refresh = async () => Promise.all([
    utils.strategy.nodes.invalidate(), utils.strategy.plans.invalidate(),
    selectedPlanId ? utils.strategy.edges.invalidate({ planVersionId: selectedPlanId }) : Promise.resolve(),
    selectedPlanId ? utils.strategy.stagedChanges.invalidate({ planVersionId: selectedPlanId }) : Promise.resolve(),
    selectedNodeId ? utils.strategy.trace.invalidate({ nodeId: selectedNodeId }) : Promise.resolve(),
  ]);
  const createNode = trpc.strategy.createNode.useMutation();
  const linkEdge = trpc.strategy.linkEdge.useMutation();
  const submit = trpc.governance.submit.useMutation();
  const busy = createNode.isPending || linkEdge.isPending || submit.isPending;

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

  return (
    <div className="space-y-4 p-4 sm:p-6" data-testid="persisted-strategy-explorer">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold text-gray-900">Strategy Hierarchy</h1>
          <p className="mt-1 text-sm text-gray-500">Persisted hierarchy, traversal, and governed structural changes · {planNodes.length} nodes</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => void refresh()} className="rounded-full border border-gray-300 p-2 text-gray-500 hover:bg-gray-50" title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button onClick={exportJson} className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Download className="h-4 w-4" /> Export
          </button>
          <button
            onClick={() => setForm((current) => ({ ...current, parentId: "", nameEn: "", nameAr: "" }))}
            className="flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" /> Add Node
          </button>
        </div>
      </div>

      <label className="block text-sm text-gray-600">
        Plan version
        <select value={selectedPlanId} onChange={(event) => { setPlanId(event.target.value); setSelectedNodeId(""); }} className="ml-2 rounded-full border border-gray-300 px-3 py-1.5 text-sm">
          {plans.data?.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.status}</option>)}
        </select>
      </label>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

      {/* toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search nodes..."
              className="w-64 rounded-full border border-gray-300 py-2 pl-9 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <select
            value={filters.type}
            onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as NodeType | "all" }))}
            className="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 outline-none focus:border-indigo-500"
          >
            <option value="all">All Types</option>
            {NODE_TYPES.map((key) => <option key={key} value={key}>{TYPE_CONFIG[key].label}</option>)}
          </select>
          <select
            value={filters.state}
            onChange={(e) => setFilters((f) => ({ ...f, state: e.target.value as NodeState | "all" }))}
            className="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 outline-none focus:border-indigo-500"
          >
            <option value="all">All States</option>
            {(Object.keys(STATE_CONFIG) as NodeState[]).map((key) => <option key={key} value={key}>{STATE_CONFIG[key].label}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={expandAll} title="Expand all" className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50">
            <Maximize2 className="h-4 w-4" />
          </button>
          <button onClick={collapseAll} title="Collapse all" className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50">
            <Minimize2 className="h-4 w-4" />
          </button>
          <div className="flex items-center rounded-full border border-gray-300 p-1">
            <button onClick={() => setView("tree")} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${view === "tree" ? "bg-gray-900 text-white" : "text-gray-600"}`}>
              <Network className="h-3.5 w-3.5" /> Tree
            </button>
            <button onClick={() => setView("list")} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${view === "list" ? "bg-gray-900 text-white" : "text-gray-600"}`}>
              <LayoutList className="h-3.5 w-3.5" /> List
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* tree / list */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <span>Name</span>
            <span>State</span>
          </div>

          {filteredForest.length === 0 && (
            <div className="px-4 py-16 text-center text-sm text-gray-400">No nodes match your filters.</div>
          )}

          {view === "tree" && filteredForest.map((root, idx) => (
            <TreeRow
              key={root.id}
              node={root}
              depth={0}
              lines={[]}
              hasNextSibling={idx < filteredForest.length - 1}
              expandedIds={expandedIds}
              forceExpanded={filtering}
              selectedId={selectedNodeId || null}
              onToggle={toggle}
              onSelect={setSelectedNodeId}
              onAddChild={(id) => setForm((current) => ({ ...current, parentId: id }))}
            />
          ))}

          {view === "list" && listRows.map(({ node }) => {
            const typeCfg = TYPE_CONFIG[node.type];
            const stateCfg = STATE_CONFIG[node.state];
            const Icon = typeCfg.icon;
            return (
              <div
                key={node.id}
                data-testid="persisted-strategy-node"
                onClick={() => setSelectedNodeId(node.id)}
                className={`flex cursor-pointer flex-col gap-1.5 border-b border-gray-100 px-4 py-2.5 hover:bg-gray-50 md:h-[52px] md:flex-row md:items-center md:justify-between md:gap-4 md:py-0 ${selectedNodeId === node.id ? "bg-blue-50/60" : ""}`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${typeCfg.bg}`}>
                    <Icon className={`h-3.5 w-3.5 ${typeCfg.text}`} />
                  </span>
                  <span className="truncate text-[15px] text-gray-900">{node.nameEn}</span>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">{typeCfg.label}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2 pl-9 md:pl-0">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${stateCfg.dot}`} />
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${stateCfg.badgeBg} ${stateCfg.badgeText}`}>{stateCfg.label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* side panel */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="font-semibold text-gray-900">Node detail &amp; traversal</h2>
            {detail.data ? (
              <div className="mt-2 text-sm">
                <p className="font-medium text-gray-900">{detail.data.nameEn}</p>
                <p dir="rtl" className="text-gray-500">{detail.data.nameAr}</p>
                <p className="mt-2 text-gray-500">Ancestry: {trace.data?.ancestry.map((item) => item.nameEn).join(" → ") || "root"}</p>
                <p className="text-gray-500">Cascade: {trace.data?.cascade.length ?? 0} node(s)</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-400">Select a node to view its detail.</p>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="mb-2 font-semibold text-gray-900">Staged changes</h2>
            {staged.data?.map((change) => (
              <div key={change.id} data-testid="persisted-staged-change" className="border-t border-gray-100 py-2 text-sm first:border-t-0">
                {change.kind} · {change.status} · case {change.approvalCaseId}
              </div>
            ))}
            {staged.data?.length === 0 && <p className="text-sm text-gray-400">No staged changes.</p>}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="mb-2 flex items-center gap-1.5 font-semibold text-gray-900"><Plus className="h-4 w-4" /> Persist structural change</h2>
            <div className="space-y-2">
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as NodeType })} className="w-full rounded-lg border border-gray-300 p-2 text-sm">
                {NODE_TYPES.map((key) => <option key={key} value={key}>{TYPE_CONFIG[key].label}</option>)}
              </select>
              <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })} className="w-full rounded-lg border border-gray-300 p-2 text-sm">
                <option value="">No parent (root)</option>
                {parentOptions.map(({ id, nameEn, depth }) => <option key={id} value={id}>{"— ".repeat(depth)}{nameEn}</option>)}
              </select>
              {form.parentId && (
                <select value={form.edgeType} onChange={(e) => setForm({ ...form, edgeType: e.target.value as EdgeType })} className="w-full rounded-lg border border-gray-300 p-2 text-sm">
                  <option value="contains">Contains</option>
                  <option value="executed_by">Executed by</option>
                  <option value="belongs_to_portfolio">Belongs to portfolio</option>
                  <option value="aligns_to">Aligns to</option>
                </select>
              )}
              <input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} placeholder="English name" className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
              <input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} placeholder="Arabic name" className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
              {selectedPlan?.status === "active" && (
                <input value={form.approverId} onChange={(e) => setForm({ ...form, approverId: e.target.value })} placeholder="Different approver UUID" className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
              )}
              <button
                disabled={busy || !form.nameEn || !form.nameAr || (selectedPlan?.status === "active" && !form.approverId)}
                onClick={() => void saveNode()}
                className="w-full rounded-lg bg-slate-900 p-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {selectedPlan?.status === "active" ? "Stage & submit" : "Save draft"}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
