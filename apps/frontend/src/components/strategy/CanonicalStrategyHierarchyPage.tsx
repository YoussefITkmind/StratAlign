"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Download,
  Edit3,
  Focus,
  Layers3,
  LayoutList,
  Loader2,
  Maximize2,
  Minimize2,
  Network,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Share2,
  Sparkles,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { usePublishAssistantContext } from "@/lib/assistant/assistant-context";
import {
  buildCanonicalForest,
  CANONICAL_NODE_TYPE_LABELS,
  CANONICAL_RELATIONSHIP_LABELS,
  CANONICAL_STATE_LABELS,
  collectCanonicalTreeIds,
  filterCanonicalForest,
  getAllowedChildRelationships,
  relationshipForChild,
  type CanonicalHierarchyFilters,
  type CanonicalStrategyNode,
  type CanonicalStrategyNodeType,
  type CanonicalStrategyTreeNode,
} from "@/lib/canonicalStrategyHierarchy";

interface Props {
  canManageStrategy: boolean;
}

type EditorState =
  | { mode: "create"; parent: CanonicalStrategyTreeNode | null }
  | { mode: "edit"; node: CanonicalStrategyTreeNode }
  | null;

type ViewMode = "tree" | "list";
type PlanStatus = "draft" | "active" | "closed";

const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  draft: "Draft",
  active: "Active",
  closed: "Closed",
};

const PLAN_STATUS_STYLES: Record<PlanStatus, string> = {
  draft: "border-slate-200 bg-slate-50 text-slate-700",
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  closed: "border-slate-200 bg-slate-100 text-slate-500",
};

const NODE_STATE_STYLES = {
  draft: "border-slate-200 bg-slate-50 text-slate-600",
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  retired: "border-red-200 bg-red-50 text-red-700",
} as const;

const TYPE_STYLES: Record<CanonicalStrategyNodeType, { bg: string; text: string }> = {
  corporate_strategy: { bg: "bg-indigo-100", text: "text-indigo-600" },
  theme: { bg: "bg-violet-100", text: "text-violet-600" },
  objective: { bg: "bg-blue-100", text: "text-blue-600" },
  strategic_play: { bg: "bg-cyan-100", text: "text-cyan-700" },
  portfolio: { bg: "bg-amber-100", text: "text-amber-700" },
  area_of_focus: { bg: "bg-emerald-100", text: "text-emerald-700" },
};

const TYPE_ICONS = {
  corporate_strategy: Network,
  theme: Layers3,
  objective: Target,
  strategic_play: Rocket,
  portfolio: BriefcaseBusiness,
  area_of_focus: Focus,
} as const;

const MAX_ASSISTANT_CONTEXT_NODES = 30;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The operation could not be completed.";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "—";
}

function flattenForest(forest: readonly CanonicalStrategyTreeNode[]) {
  const rows: Array<{ node: CanonicalStrategyTreeNode; depth: number }> = [];
  const visit = (node: CanonicalStrategyTreeNode, depth: number) => {
    rows.push({ node, depth });
    node.children.forEach((child) => visit(child, depth + 1));
  };
  forest.forEach((root) => visit(root, 0));
  return rows;
}

export default function CanonicalStrategyHierarchyPage({ canManageStrategy }: Props) {
  const utils = trpc.useUtils();
  const plans = trpc.strategy.plans.useQuery();
  const nodes = trpc.strategy.nodes.useQuery();
  const people = trpc.governance.listApprovers.useQuery();

  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<ViewMode>("tree");
  const [filters, setFilters] = useState<CanonicalHierarchyFilters>({ search: "", type: "all", state: "all" });
  const [editor, setEditor] = useState<EditorState>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nodeCountByPlan = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of nodes.data ?? []) {
      counts.set(node.planVersionId, (counts.get(node.planVersionId) ?? 0) + 1);
    }
    return counts;
  }, [nodes.data]);

  useEffect(() => {
    if (selectedPlanId || !plans.data?.length || !nodes.data) return;
    const active = plans.data.find((plan) => plan.status === "active");
    const populatedDrafts = plans.data
      .filter((plan) => plan.status === "draft")
      .sort((a, b) => (nodeCountByPlan.get(b.id) ?? 0) - (nodeCountByPlan.get(a.id) ?? 0));
    const preferred = active ?? populatedDrafts[0] ?? plans.data[0];
    if (preferred) setSelectedPlanId(preferred.id);
  }, [nodeCountByPlan, nodes.data, plans.data, selectedPlanId]);

  const selectedPlan = useMemo(
    () => plans.data?.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans.data, selectedPlanId],
  );

  const edges = trpc.strategy.edges.useQuery(
    { planVersionId: selectedPlanId || "00000000-0000-4000-8000-000000000000" },
    { enabled: Boolean(selectedPlanId) },
  );

  const planNodes = useMemo(
    () => ((nodes.data ?? []).filter((node) => node.planVersionId === selectedPlanId) as CanonicalStrategyNode[]),
    [nodes.data, selectedPlanId],
  );

  const forest = useMemo(() => buildCanonicalForest(planNodes, edges.data ?? []), [planNodes, edges.data]);
  const filteredForest = useMemo(() => filterCanonicalForest(forest, filters), [forest, filters]);
  const flatRows = useMemo(() => flattenForest(filteredForest), [filteredForest]);
  const filtering = Boolean(filters.search.trim() || filters.type !== "all" || filters.state !== "all");

  const peopleById = useMemo(
    () => new Map((people.data ?? []).map((person) => [person.id, person.name])),
    [people.data],
  );

  const selectedNode = useMemo(
    () => planNodes.find((node) => node.id === selectedNodeId) ?? null,
    [planNodes, selectedNodeId],
  );

  const assistantEntity = selectedNode
    ? { type: selectedNode.type, id: selectedNode.id, name: selectedNode.nameEn }
    : selectedPlan
      ? { type: "strategy_plan", id: selectedPlan.id, name: selectedPlan.name }
      : null;
  const assistantData = useMemo(
    () => selectedPlan
      ? {
          plan: { id: selectedPlan.id, name: selectedPlan.name, status: selectedPlan.status },
          totalNodes: planNodes.length,
          nodes: flattenForest(forest).slice(0, MAX_ASSISTANT_CONTEXT_NODES).map(({ node, depth }) => ({
            id: node.id,
            name: node.nameEn,
            type: node.type,
            state: node.state,
            depth,
          })),
        }
      : null,
    [forest, planNodes.length, selectedPlan],
  );
  usePublishAssistantContext("strategy_hierarchy", assistantEntity, assistantData);

  useEffect(() => {
    setExpandedIds(new Set(collectCanonicalTreeIds(forest)));
    setSelectedNodeId(null);
  }, [selectedPlanId, edges.dataUpdatedAt, nodes.dataUpdatedAt]);

  const refresh = async () => {
    await Promise.all([
      utils.strategy.plans.invalidate(),
      utils.strategy.nodes.invalidate(),
      selectedPlanId ? utils.strategy.edges.invalidate({ planVersionId: selectedPlanId }) : Promise.resolve(),
    ]);
  };

  const createPlan = trpc.strategy.createPlan.useMutation({
    onSuccess: async (plan) => {
      setSelectedPlanId(plan.id);
      setShowPlanModal(false);
      setNotice(`Draft plan “${plan.name}” created.`);
      setError(null);
      await refresh();
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const createNode = trpc.strategy.createNode.useMutation();
  const linkEdge = trpc.strategy.linkEdge.useMutation();
  const updateNode = trpc.strategy.updateNode.useMutation();
  const retireNode = trpc.strategy.retireNode.useMutation();
  const assignOwner = trpc.strategy.assignOwner.useMutation();
  const openPlan = trpc.strategy.openPlan.useMutation({
    onSuccess: async () => {
      setNotice("Strategy plan activated. Its Strategic Plays are now available to Initiatives & Projects.");
      setError(null);
      await refresh();
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const isDraft = selectedPlan?.status === "draft";
  const canEdit = canManageStrategy && isDraft;
  const loading = plans.isLoading || nodes.isLoading || (Boolean(selectedPlanId) && edges.isLoading);
  const queryError = plans.error ?? nodes.error ?? edges.error;

  const handleCreateNode = async (input: {
    parent: CanonicalStrategyTreeNode | null;
    type: CanonicalStrategyNodeType;
    name: string;
    ownerUserId: string;
  }) => {
    if (!selectedPlan || selectedPlan.status !== "draft") return;
    setError(null);
    let createdNodeId: string | null = null;
    try {
      const created = await createNode.mutateAsync({
        type: input.type,
        nameEn: input.name,
        nameAr: input.name,
        planVersionId: selectedPlan.id,
      });
      if ("kind" in created) throw new Error("Draft strategy edit was unexpectedly staged for approval.");
      createdNodeId = created.id;

      if (input.parent) {
        const edgeType = relationshipForChild(input.parent.type, input.type);
        if (!edgeType) throw new Error("That parent/child relationship is not allowed by the strategy model.");
        await linkEdge.mutateAsync({
          fromNodeId: input.parent.id,
          toNodeId: created.id,
          edgeType,
          planVersionId: selectedPlan.id,
        });
      }

      if (input.ownerUserId) {
        await assignOwner.mutateAsync({ nodeId: created.id, ownerUserId: input.ownerUserId });
      }

      setEditor(null);
      setNotice(`${CANONICAL_NODE_TYPE_LABELS[input.type]} “${input.name}” created.`);
      await refresh();
    } catch (cause) {
      if (createdNodeId) await retireNode.mutateAsync({ nodeId: createdNodeId }).catch(() => undefined);
      setError(errorMessage(cause));
    }
  };

  const handleUpdateNode = async (input: {
    node: CanonicalStrategyTreeNode;
    name: string;
    ownerUserId: string;
  }) => {
    setError(null);
    try {
      await updateNode.mutateAsync({ nodeId: input.node.id, nameEn: input.name });
      if (input.ownerUserId) await assignOwner.mutateAsync({ nodeId: input.node.id, ownerUserId: input.ownerUserId });
      setEditor(null);
      setNotice(`“${input.name}” updated.`);
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const handleRetire = async (node: CanonicalStrategyTreeNode) => {
    if (node.children.length > 0) {
      setError("Retire child nodes first. A parent with active children cannot be retired from this editor.");
      return;
    }
    if (!window.confirm(`Retire “${node.nameEn}”?`)) return;
    try {
      await retireNode.mutateAsync({ nodeId: node.id });
      setNotice(`“${node.nameEn}” retired.`);
      setError(null);
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const exportJson = () => {
    if (!selectedPlan) return;
    const payload = { plan: selectedPlan, nodes: planNodes, edges: edges.data ?? [] };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedPlan.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-hierarchy.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const sharePage = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice("Strategy Hierarchy link copied to clipboard.");
    } catch {
      setError("Could not copy the page link.");
    }
  };

  const expandAll = () => setExpandedIds(new Set(collectCanonicalTreeIds(filteredForest)));
  const collapseAll = () => setExpandedIds(new Set());

  return (
    <div className="w-full p-6">
      <div className="mb-4 flex items-center gap-1.5 text-sm text-gray-500">
        <span>Home</span><ChevronRight className="h-3.5 w-3.5" /><span>Strategy</span><ChevronRight className="h-3.5 w-3.5" /><span className="font-medium text-gray-900">Strategy Hierarchy</span>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold text-gray-900">Strategy Hierarchy</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your complete organizational strategy · {planNodes.length} nodes</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={exportJson} disabled={!selectedPlan} className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">
            <Download className="h-4 w-4" /> Export
          </button>
          <button onClick={() => void sharePage()} className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Share2 className="h-4 w-4" /> Share
          </button>
          {canManageStrategy && (
            <button onClick={() => setShowPlanModal(true)} className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Plus className="h-4 w-4" /> New Plan
            </button>
          )}
          {canManageStrategy && selectedPlan?.status === "draft" && forest.length > 0 && (
            <button onClick={() => openPlan.mutate({ planVersionId: selectedPlan.id })} disabled={openPlan.isPending} className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
              <CheckCircle2 className="h-4 w-4" /> {openPlan.isPending ? "Activating…" : "Activate Plan"}
            </button>
          )}
          <button title="Strategy Brief uses the selected canonical strategy as context" className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90">
            <Sparkles className="h-4 w-4" /> Generate Strategy Brief
          </button>
        </div>
      </div>

      {notice && <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4" />{notice}</div>}
      {error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4" />{error}</div>}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={selectedPlanId}
              onChange={(event) => setSelectedPlanId(event.target.value)}
              className="min-w-[280px] appearance-none rounded-full border border-gray-300 bg-white py-2 pl-4 pr-10 text-sm font-medium text-gray-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              {!plans.data?.length && <option value="">No plan versions</option>}
              {plans.data?.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} · {PLAN_STATUS_LABELS[plan.status as PlanStatus]}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
          {selectedPlan && (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold ${PLAN_STATUS_STYLES[selectedPlan.status as PlanStatus]}`}>
              <CircleDot className="h-3.5 w-3.5" /> {PLAN_STATUS_LABELS[selectedPlan.status as PlanStatus]}
            </span>
          )}
          <button onClick={() => void refresh()} className="rounded-full border border-gray-300 p-2.5 text-gray-500 hover:bg-gray-50" title="Refresh persisted strategy">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        {selectedPlan?.status === "draft" && <span className="text-xs text-gray-500">Draft plans are editable. Activate when the hierarchy is complete.</span>}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Search nodes..."
              className="w-64 rounded-full border border-gray-300 py-2 pl-9 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <select value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value as CanonicalHierarchyFilters["type"] }))} className="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 outline-none focus:border-indigo-500">
            <option value="all">All Types</option>
            {Object.entries(CANONICAL_NODE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={filters.state} onChange={(event) => setFilters((current) => ({ ...current, state: event.target.value as CanonicalHierarchyFilters["state"] }))} className="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 outline-none focus:border-indigo-500">
            <option value="all">All States</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={expandAll} title="Expand all" className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50"><Maximize2 className="h-4 w-4" /></button>
          <button onClick={collapseAll} title="Collapse all" className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50"><Minimize2 className="h-4 w-4" /></button>
          <div className="flex items-center rounded-full border border-gray-300 p-1">
            <button onClick={() => setView("tree")} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${view === "tree" ? "bg-gray-900 text-white" : "text-gray-600"}`}><Network className="h-3.5 w-3.5" /> Tree</button>
            <button onClick={() => setView("list")} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${view === "list" ? "bg-gray-900 text-white" : "text-gray-600"}`}><LayoutList className="h-3.5 w-3.5" /> List</button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="grid grid-cols-[minmax(0,1fr)_120px_120px] items-center border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <span>Name</span><span>Owner</span><span>State</span>
        </div>

        {loading && <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading strategy hierarchy…</div>}
        {!loading && queryError && <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center text-sm text-red-500"><AlertTriangle className="h-5 w-5" />Couldn&apos;t load the strategy hierarchy. Please try again.</div>}
        {!loading && !queryError && !selectedPlan && <EmptyState title="No strategy plan yet" body="Create a draft plan to start building the canonical strategy hierarchy." action={canManageStrategy ? () => setShowPlanModal(true) : undefined} actionLabel="Create Draft Plan" />}
        {!loading && !queryError && selectedPlan && forest.length === 0 && <EmptyState title="This plan has no strategy nodes" body={isDraft ? "Start with a Corporate Strategy, then add Themes, Objectives and Strategic Plays underneath it." : "No active strategy nodes were found for this plan."} action={canEdit ? () => setEditor({ mode: "create", parent: null }) : undefined} actionLabel="Add Corporate Strategy" />}
        {!loading && !queryError && forest.length > 0 && filteredForest.length === 0 && <EmptyState title="No nodes match your filters" body="Change the search or filters to see more of this strategy." />}

        {!loading && !queryError && view === "tree" && filteredForest.map((root, index) => (
          <HierarchyRow
            key={root.id}
            node={root}
            depth={0}
            lines={[]}
            hasNextSibling={index < filteredForest.length - 1}
            expandedIds={expandedIds}
            forceExpanded={filtering}
            setExpandedIds={setExpandedIds}
            canEdit={canEdit}
            selectedNodeId={selectedNodeId}
            peopleById={peopleById}
            onSelect={setSelectedNodeId}
            onAdd={(node) => setEditor({ mode: "create", parent: node })}
            onEdit={(node) => setEditor({ mode: "edit", node })}
            onRetire={handleRetire}
          />
        ))}

        {!loading && !queryError && view === "list" && flatRows.map(({ node, depth }, rowIndex) => (
          <ListRow key={`${node.id}:${depth}:${rowIndex}`} node={node} depth={depth} selected={node.id === selectedNodeId} ownerName={peopleById.get(node.createdBy) ?? "Unassigned"} onSelect={() => setSelectedNodeId(node.id)} />
        ))}
      </div>

      {showPlanModal && <NewPlanModal pending={createPlan.isPending} onClose={() => setShowPlanModal(false)} onCreate={(name) => createPlan.mutate({ name })} />}
      {editor && selectedPlan && (
        <NodeEditorModal
          state={editor}
          people={people.data ?? []}
          pending={createNode.isPending || linkEdge.isPending || updateNode.isPending || assignOwner.isPending}
          onClose={() => setEditor(null)}
          onCreate={handleCreateNode}
          onUpdate={handleUpdateNode}
        />
      )}
    </div>
  );
}

const ELBOW_Y = 26;

function HierarchyRow({ node, depth, lines, hasNextSibling, expandedIds, forceExpanded, setExpandedIds, canEdit, selectedNodeId, peopleById, onSelect, onAdd, onEdit, onRetire }: {
  node: CanonicalStrategyTreeNode;
  depth: number;
  lines: boolean[];
  hasNextSibling: boolean;
  expandedIds: Set<string>;
  forceExpanded: boolean;
  setExpandedIds: Dispatch<SetStateAction<Set<string>>>;
  canEdit: boolean;
  selectedNodeId: string | null;
  peopleById: Map<string, string>;
  onSelect: (id: string) => void;
  onAdd: (node: CanonicalStrategyTreeNode) => void;
  onEdit: (node: CanonicalStrategyTreeNode) => void;
  onRetire: (node: CanonicalStrategyTreeNode) => void;
}) {
  const hasChildren = node.children.length > 0;
  const open = forceExpanded || expandedIds.has(node.id);
  const typeStyle = TYPE_STYLES[node.type];
  const Icon = TYPE_ICONS[node.type];
  const ownerName = peopleById.get(node.createdBy) ?? "Unassigned";
  const allowedChildren = getAllowedChildRelationships(node.type);
  const selected = selectedNodeId === node.id;

  const toggle = () => setExpandedIds((current) => {
    const next = new Set(current);
    if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
    return next;
  });

  return (
    <>
      <div onClick={() => onSelect(node.id)} className={`group grid min-h-[52px] cursor-pointer grid-cols-[minmax(0,1fr)_120px_120px] items-stretch border-b border-gray-100 hover:bg-gray-50 ${selected ? "bg-indigo-50/60 hover:bg-indigo-50/60" : ""}`}>
        <div className="flex min-w-0 items-stretch">
          {depth > 0 && Array.from({ length: depth }).map((_, column) => {
            const elbow = column === depth - 1;
            return (
              <div key={column} className="relative w-6 shrink-0">
                {elbow ? <><span className="absolute left-1/2 top-0 w-px -translate-x-1/2 bg-gray-200" style={{ height: ELBOW_Y }} />{hasNextSibling && <span className="absolute bottom-0 left-1/2 w-px -translate-x-1/2 bg-gray-200" style={{ top: ELBOW_Y }} />}<span className="absolute left-1/2 h-px w-3 -translate-y-1/2 bg-gray-200" style={{ top: ELBOW_Y }} /></> : lines[column] && <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gray-200" />}
              </div>
            );
          })}
          <div className="relative w-7 shrink-0">
            {hasChildren && <button onClick={(event) => { event.stopPropagation(); toggle(); }} className="absolute left-1/2 top-[26px] -translate-x-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>}
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pr-3">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${typeStyle.bg}`}><Icon className={`h-3.5 w-3.5 ${typeStyle.text}`} /></span>
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[15px] font-medium text-gray-900">{node.nameEn}</span>
              <span className="hidden shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 xl:inline">{CANONICAL_NODE_TYPE_LABELS[node.type]}</span>
              {node.relationshipFromParent && <span className="hidden shrink-0 text-[10px] text-gray-400 2xl:inline">{CANONICAL_RELATIONSHIP_LABELS[node.relationshipFromParent]}</span>}
            </div>
            {canEdit && <div className="ml-auto hidden items-center gap-0.5 group-hover:flex">{allowedChildren.length > 0 && <button onClick={(event) => { event.stopPropagation(); onAdd(node); }} title="Add child" className="rounded p-1 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600"><Plus className="h-3.5 w-3.5" /></button>}<button onClick={(event) => { event.stopPropagation(); onEdit(node); }} title="Edit" className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600"><Edit3 className="h-3.5 w-3.5" /></button><button onClick={(event) => { event.stopPropagation(); onRetire(node); }} title="Retire" className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button></div>}
          </div>
        </div>
        <div className="flex items-center gap-2 px-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-semibold text-white" title={ownerName}>{initials(ownerName)}</span>
          <span className="truncate text-xs text-gray-500">{ownerName}</span>
        </div>
        <div className="flex items-center px-2"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${NODE_STATE_STYLES[node.state]}`}>{CANONICAL_STATE_LABELS[node.state]}</span></div>
      </div>
      {hasChildren && open && node.children.map((child, index) => <HierarchyRow key={child.id} node={child} depth={depth + 1} lines={[...lines, hasNextSibling]} hasNextSibling={index < node.children.length - 1} expandedIds={expandedIds} forceExpanded={forceExpanded} setExpandedIds={setExpandedIds} canEdit={canEdit} selectedNodeId={selectedNodeId} peopleById={peopleById} onSelect={onSelect} onAdd={onAdd} onEdit={onEdit} onRetire={onRetire} />)}
    </>
  );
}

function ListRow({ node, depth, selected, ownerName, onSelect }: { node: CanonicalStrategyTreeNode; depth: number; selected: boolean; ownerName: string; onSelect: () => void }) {
  const typeStyle = TYPE_STYLES[node.type];
  const Icon = TYPE_ICONS[node.type];
  return <div onClick={onSelect} className={`grid min-h-[52px] cursor-pointer grid-cols-[minmax(0,1fr)_120px_120px] items-center border-b border-gray-100 px-4 hover:bg-gray-50 ${selected ? "bg-indigo-50/60" : ""}`}><div className="flex min-w-0 items-center gap-2.5" style={{ paddingLeft: depth * 16 }}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${typeStyle.bg}`}><Icon className={`h-3.5 w-3.5 ${typeStyle.text}`} /></span><span className="truncate text-[15px] text-gray-900">{node.nameEn}</span><span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">{CANONICAL_NODE_TYPE_LABELS[node.type]}</span></div><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-semibold text-white">{initials(ownerName)}</span><span className="truncate text-xs text-gray-500">{ownerName}</span></div><div><span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${NODE_STATE_STYLES[node.state]}`}>{CANONICAL_STATE_LABELS[node.state]}</span></div></div>;
}

function EmptyState({ title, body, action, actionLabel }: { title: string; body: string; action?: () => void; actionLabel?: string }) {
  return <div className="px-6 py-16 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400"><Network className="h-5 w-5" /></span><h2 className="mt-3 text-base font-semibold text-gray-800">{title}</h2><p className="mx-auto mt-1 max-w-lg text-sm text-gray-500">{body}</p>{action && <button onClick={action} className="mt-4 rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">{actionLabel}</button>}</div>;
}

function NewPlanModal({ pending, onClose, onCreate }: { pending: boolean; onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-lg font-bold text-slate-900">New Strategy Plan</h2><p className="mt-1 text-sm text-slate-500">Create a real draft plan version in the canonical strategy model.</p></div><button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button></div><label className="mt-5 block text-sm font-semibold text-slate-700">Plan name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. FY2027 Corporate Strategy" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label><div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button><button disabled={!name.trim() || pending} onClick={() => onCreate(name.trim())} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{pending ? "Creating…" : "Create Draft Plan"}</button></div></div></div>;
}

function NodeEditorModal({ state, people, pending, onClose, onCreate, onUpdate }: {
  state: Exclude<EditorState, null>;
  people: Array<{ id: string; name: string }>;
  pending: boolean;
  onClose: () => void;
  onCreate: (input: { parent: CanonicalStrategyTreeNode | null; type: CanonicalStrategyNodeType; name: string; ownerUserId: string }) => Promise<void>;
  onUpdate: (input: { node: CanonicalStrategyTreeNode; name: string; ownerUserId: string }) => Promise<void>;
}) {
  const parent = state.mode === "create" ? state.parent : null;
  const allowed = state.mode === "create"
    ? parent
      ? getAllowedChildRelationships(parent.type).map((item) => item.type)
      : (["corporate_strategy"] as CanonicalStrategyNodeType[])
    : [state.node.type];
  const [type, setType] = useState<CanonicalStrategyNodeType>(allowed[0]!);
  const [name, setName] = useState(state.mode === "edit" ? state.node.nameEn : "");
  const [ownerUserId, setOwnerUserId] = useState("");
  const valid = Boolean(name.trim());

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-lg font-bold text-slate-900">{state.mode === "create" ? `Add ${CANONICAL_NODE_TYPE_LABELS[type]}` : `Edit ${CANONICAL_NODE_TYPE_LABELS[state.node.type]}`}</h2><p className="mt-1 text-sm text-slate-500">{parent ? `Under “${parent.nameEn}”` : "Root of this strategy plan"}</p></div><button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button></div>
    {state.mode === "create" && allowed.length > 1 && <label className="mt-5 block text-sm font-semibold text-slate-700">Type<select value={type} onChange={(event) => setType(event.target.value as CanonicalStrategyNodeType)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm">{allowed.map((value) => <option key={value} value={value}>{CANONICAL_NODE_TYPE_LABELS[value]}</option>)}</select></label>}
    <label className="mt-4 block text-sm font-semibold text-slate-700">Name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label>
    <label className="mt-4 block text-sm font-semibold text-slate-700">Owner <span className="font-normal text-slate-400">(optional)</span><select value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm"><option value="">No owner change</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
    <div className="mt-6 flex justify-end gap-2"><button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button><button disabled={!valid || pending} onClick={() => void (state.mode === "create" ? onCreate({ parent, type, name: name.trim(), ownerUserId }) : onUpdate({ node: state.node, name: name.trim(), ownerUserId }))} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{pending ? "Saving…" : state.mode === "create" ? "Add Node" : "Save Changes"}</button></div>
  </div></div>;
}
