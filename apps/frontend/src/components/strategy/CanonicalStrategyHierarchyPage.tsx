"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Edit3,
  FolderTree,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
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

const TYPE_ACCENT: Record<CanonicalStrategyNodeType, string> = {
  corporate_strategy: "border-indigo-200 bg-indigo-50 text-indigo-700",
  theme: "border-violet-200 bg-violet-50 text-violet-700",
  objective: "border-blue-200 bg-blue-50 text-blue-700",
  strategic_play: "border-cyan-200 bg-cyan-50 text-cyan-700",
  portfolio: "border-amber-200 bg-amber-50 text-amber-700",
  area_of_focus: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const STATE_ACCENT = {
  draft: "border-slate-200 bg-slate-50 text-slate-700",
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  retired: "border-red-200 bg-red-50 text-red-700",
} as const;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The operation could not be completed.";
}

export default function CanonicalStrategyHierarchyPage({ canManageStrategy }: Props) {
  const utils = trpc.useUtils();
  const plans = trpc.strategy.plans.useQuery();
  const nodes = trpc.strategy.nodes.useQuery();
  const approvers = trpc.governance.listApprovers.useQuery(undefined, { enabled: canManageStrategy });

  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<CanonicalHierarchyFilters>({ search: "", type: "all", state: "all" });
  const [editor, setEditor] = useState<EditorState>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedPlan = useMemo(
    () => plans.data?.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans.data, selectedPlanId],
  );

  useEffect(() => {
    if (selectedPlanId || !plans.data?.length) return;
    const preferred = plans.data.find((plan) => plan.status === "draft")
      ?? plans.data.find((plan) => plan.status === "active")
      ?? plans.data[0];
    if (preferred) setSelectedPlanId(preferred.id);
  }, [plans.data, selectedPlanId]);

  const edges = trpc.strategy.edges.useQuery(
    { planVersionId: selectedPlanId || "00000000-0000-4000-8000-000000000000" },
    { enabled: Boolean(selectedPlanId) },
  );

  const planNodes = useMemo(
    () => ((nodes.data ?? []).filter((node) => node.planVersionId === selectedPlanId) as CanonicalStrategyNode[]),
    [nodes.data, selectedPlanId],
  );

  const forest = useMemo(
    () => buildCanonicalForest(planNodes, edges.data ?? []),
    [planNodes, edges.data],
  );
  const filteredForest = useMemo(() => filterCanonicalForest(forest, filters), [forest, filters]);

  useEffect(() => {
    setExpandedIds(new Set(collectCanonicalTreeIds(forest)));
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
    nameEn: string;
    nameAr: string;
    ownerUserId: string;
  }) => {
    if (!selectedPlan || selectedPlan.status !== "draft") return;
    setError(null);
    let createdNodeId: string | null = null;
    try {
      const created = await createNode.mutateAsync({
        type: input.type,
        nameEn: input.nameEn,
        nameAr: input.nameAr,
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
      setNotice(`${CANONICAL_NODE_TYPE_LABELS[input.type]} “${input.nameEn}” created.`);
      await refresh();
    } catch (cause) {
      if (createdNodeId) {
        await retireNode.mutateAsync({ nodeId: createdNodeId }).catch(() => undefined);
      }
      setError(errorMessage(cause));
    }
  };

  const handleUpdateNode = async (input: { node: CanonicalStrategyTreeNode; nameEn: string; nameAr: string; ownerUserId: string }) => {
    setError(null);
    try {
      await updateNode.mutateAsync({ nodeId: input.node.id, nameEn: input.nameEn, nameAr: input.nameAr });
      if (input.ownerUserId) {
        await assignOwner.mutateAsync({ nodeId: input.node.id, ownerUserId: input.ownerUserId });
      }
      setEditor(null);
      setNotice(`“${input.nameEn}” updated.`);
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

  return (
    <div className="w-full p-6">
      <div className="mb-4 flex items-center gap-1.5 text-sm text-slate-500">
        <span>Home</span><ChevronRight className="h-3.5 w-3.5" /><span className="font-medium text-slate-900">Strategy Hierarchy</span>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <Network className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Strategy Hierarchy</h1>
            <p className="mt-1 text-sm text-slate-500">Canonical strategy structure used by Scorecards, KPIs, Strategic Plays and execution.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => void refresh()} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          {canManageStrategy && (
            <button onClick={() => setShowPlanModal(true)} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Plus className="h-4 w-4" /> New Plan
            </button>
          )}
          {canManageStrategy && selectedPlan?.status === "draft" && forest.length > 0 && (
            <button
              onClick={() => openPlan.mutate({ planVersionId: selectedPlan.id })}
              disabled={openPlan.isPending}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" /> {openPlan.isPending ? "Activating…" : "Activate Plan"}
            </button>
          )}
        </div>
      </div>

      {notice && <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4" />{notice}</div>}
      {error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4" />{error}</div>}

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_180px_1fr] lg:items-end">
          <label>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Plan version</span>
            <div className="relative">
              <select value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value)} className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-9 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100">
                {!plans.data?.length && <option value="">No plan versions yet</option>}
                {plans.data?.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {CANONICAL_STATE_LABELS[plan.status]}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </label>
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Plan status</span>
            {selectedPlan ? (
              <span className={`inline-flex h-[42px] items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${STATE_ACCENT[selectedPlan.status]}`}>
                <CircleDot className="h-4 w-4" /> {CANONICAL_STATE_LABELS[selectedPlan.status]}
              </span>
            ) : <span className="text-sm text-slate-400">—</span>}
          </div>
          <div className="text-sm text-slate-500">
            {selectedPlan?.status === "draft"
              ? "Build the complete hierarchy here, then activate it. Activation makes Strategic Plays available to Initiatives & Projects."
              : selectedPlan?.status === "active"
                ? "This is the active strategy. Create a new draft plan for structural changes."
                : "Create a draft plan to begin building the canonical strategy hierarchy."}
          </div>
        </div>
      </section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={filters.search} onChange={(e) => setFilters((current) => ({ ...current, search: e.target.value }))} placeholder="Search strategy…" className="w-64 rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </div>
          <select value={filters.type} onChange={(e) => setFilters((current) => ({ ...current, type: e.target.value as CanonicalHierarchyFilters["type"] }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none">
            <option value="all">All types</option>
            {Object.entries(CANONICAL_NODE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={filters.state} onChange={(e) => setFilters((current) => ({ ...current, state: e.target.value as CanonicalHierarchyFilters["state"] }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none">
            <option value="all">All states</option><option value="draft">Draft</option><option value="active">Active</option>
          </select>
        </div>
        <div className="text-sm text-slate-500">{planNodes.length} canonical node{planNodes.length === 1 ? "" : "s"}</div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><FolderTree className="h-4 w-4 text-indigo-500" />Canonical hierarchy</div>
          {canEdit && forest.length === 0 && (
            <button onClick={() => setEditor({ mode: "create", parent: null })} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"><Plus className="h-3.5 w-3.5" />Add Corporate Strategy</button>
          )}
        </div>

        {loading && <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading strategy hierarchy…</div>}
        {!loading && queryError && <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-red-600"><AlertTriangle className="h-4 w-4" />{queryError.message}</div>}
        {!loading && !queryError && !selectedPlan && <EmptyState title="No strategy plan yet" body="Create a draft plan to start building the real strategy hierarchy." action={canManageStrategy ? () => setShowPlanModal(true) : undefined} actionLabel="Create Draft Plan" />}
        {!loading && !queryError && selectedPlan && forest.length === 0 && <EmptyState title="This plan has no strategy nodes" body={isDraft ? "Start with one Corporate Strategy, then add Themes, Objectives and Strategic Plays underneath it." : "No active nodes were found for this plan."} action={canEdit ? () => setEditor({ mode: "create", parent: null }) : undefined} actionLabel="Add Corporate Strategy" />}
        {!loading && !queryError && filteredForest.length === 0 && forest.length > 0 && <EmptyState title="No matching nodes" body="Change the search or filters to see more of this strategy." />}

        {!loading && filteredForest.map((root) => (
          <CanonicalTreeRow key={root.id} node={root} depth={0} expandedIds={expandedIds} setExpandedIds={setExpandedIds} canEdit={canEdit} onAdd={(parent) => setEditor({ mode: "create", parent })} onEdit={(node) => setEditor({ mode: "edit", node })} onRetire={handleRetire} />
        ))}
      </section>

      {showPlanModal && <NewPlanModal pending={createPlan.isPending} onClose={() => setShowPlanModal(false)} onCreate={(name) => createPlan.mutate({ name })} />}
      {editor && selectedPlan && (
        <NodeEditorModal
          state={editor}
          approvers={approvers.data ?? []}
          pending={createNode.isPending || linkEdge.isPending || updateNode.isPending || assignOwner.isPending}
          onClose={() => setEditor(null)}
          onCreate={handleCreateNode}
          onUpdate={handleUpdateNode}
        />
      )}
    </div>
  );
}

function CanonicalTreeRow({ node, depth, expandedIds, setExpandedIds, canEdit, onAdd, onEdit, onRetire }: {
  node: CanonicalStrategyTreeNode;
  depth: number;
  expandedIds: Set<string>;
  setExpandedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  canEdit: boolean;
  onAdd: (node: CanonicalStrategyTreeNode) => void;
  onEdit: (node: CanonicalStrategyTreeNode) => void;
  onRetire: (node: CanonicalStrategyTreeNode) => void;
}) {
  const expanded = expandedIds.has(node.id);
  const allowedChildren = getAllowedChildRelationships(node.type);
  const toggle = () => setExpandedIds((current) => {
    const next = new Set(current);
    if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
    return next;
  });

  return (
    <>
      <div className="group flex min-h-[58px] items-center gap-3 border-b border-slate-100 px-4 py-2.5 hover:bg-slate-50/70" style={{ paddingLeft: `${16 + depth * 26}px` }}>
        <button onClick={toggle} disabled={node.children.length === 0} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-20">
          <ChevronRight className={`h-4 w-4 transition ${expanded ? "rotate-90" : ""}`} />
        </button>
        <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${TYPE_ACCENT[node.type]}`}>{CANONICAL_NODE_TYPE_LABELS[node.type]}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">{node.nameEn}</div>
          <div className="truncate text-xs text-slate-400" dir="rtl">{node.nameAr}</div>
        </div>
        {node.relationshipFromParent && <span className="hidden rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500 xl:inline">{CANONICAL_RELATIONSHIP_LABELS[node.relationshipFromParent]}</span>}
        <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${STATE_ACCENT[node.state]}`}>{CANONICAL_STATE_LABELS[node.state]}</span>
        {canEdit && (
          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
            {allowedChildren.length > 0 && <button onClick={() => onAdd(node)} title="Add child" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"><Plus className="h-4 w-4" /></button>}
            <button onClick={() => onEdit(node)} title="Edit" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Edit3 className="h-4 w-4" /></button>
            <button onClick={() => onRetire(node)} title="Retire" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
          </div>
        )}
      </div>
      {expanded && node.children.map((child) => <CanonicalTreeRow key={child.id} node={child} depth={depth + 1} expandedIds={expandedIds} setExpandedIds={setExpandedIds} canEdit={canEdit} onAdd={onAdd} onEdit={onEdit} onRetire={onRetire} />)}
    </>
  );
}

function EmptyState({ title, body, action, actionLabel }: { title: string; body: string; action?: () => void; actionLabel?: string }) {
  return <div className="px-6 py-14 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400"><FolderTree className="h-5 w-5" /></span><h2 className="mt-3 text-base font-semibold text-slate-800">{title}</h2><p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">{body}</p>{action && <button onClick={action} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">{actionLabel}</button>}</div>;
}

function NewPlanModal({ pending, onClose, onCreate }: { pending: boolean; onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-lg font-bold text-slate-900">New Strategy Plan</h2><p className="mt-1 text-sm text-slate-500">Creates a real draft plan version in the canonical strategy model.</p></div><button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button></div><label className="mt-5 block text-sm font-semibold text-slate-700">Plan name<input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FY2027 Corporate Strategy" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label><div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button><button disabled={!name.trim() || pending} onClick={() => onCreate(name.trim())} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{pending ? "Creating…" : "Create Draft Plan"}</button></div></div></div>;
}

function NodeEditorModal({ state, approvers, pending, onClose, onCreate, onUpdate }: {
  state: Exclude<EditorState, null>;
  approvers: Array<{ id: string; name: string }>;
  pending: boolean;
  onClose: () => void;
  onCreate: (input: { parent: CanonicalStrategyTreeNode | null; type: CanonicalStrategyNodeType; nameEn: string; nameAr: string; ownerUserId: string }) => Promise<void>;
  onUpdate: (input: { node: CanonicalStrategyTreeNode; nameEn: string; nameAr: string; ownerUserId: string }) => Promise<void>;
}) {
  const parent = state.mode === "create" ? state.parent : null;
  const allowed = state.mode === "create"
    ? parent ? getAllowedChildRelationships(parent.type).map((item) => item.type) : (["corporate_strategy"] as CanonicalStrategyNodeType[])
    : [state.node.type];
  const [type, setType] = useState<CanonicalStrategyNodeType>(allowed[0]!);
  const [nameEn, setNameEn] = useState(state.mode === "edit" ? state.node.nameEn : "");
  const [nameAr, setNameAr] = useState(state.mode === "edit" ? state.node.nameAr : "");
  const [ownerUserId, setOwnerUserId] = useState("");
  const valid = nameEn.trim() && nameAr.trim();

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-lg font-bold text-slate-900">{state.mode === "create" ? `Add ${CANONICAL_NODE_TYPE_LABELS[type]}` : `Edit ${CANONICAL_NODE_TYPE_LABELS[state.node.type]}`}</h2><p className="mt-1 text-sm text-slate-500">{parent ? `Under “${parent.nameEn}”` : "Root of this strategy plan"}</p></div><button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button></div>
    {state.mode === "create" && allowed.length > 1 && <label className="mt-5 block text-sm font-semibold text-slate-700">Node type<select value={type} onChange={(e) => setType(e.target.value as CanonicalStrategyNodeType)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm">{allowed.map((item) => <option key={item} value={item}>{CANONICAL_NODE_TYPE_LABELS[item]}</option>)}</select></label>}
    <label className="mt-4 block text-sm font-semibold text-slate-700">English name<input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label>
    <label className="mt-4 block text-sm font-semibold text-slate-700">Arabic name<input dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label>
    <label className="mt-4 block text-sm font-semibold text-slate-700">Owner <span className="font-normal text-slate-400">(optional)</span><select value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"><option value="">{state.mode === "edit" ? "Keep current owner" : "No owner yet"}</option>{approvers.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
    {state.mode === "create" && parent && <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 px-3.5 py-3 text-xs text-indigo-800"><ShieldCheck className="mr-1.5 inline h-3.5 w-3.5" />Relationship: {CANONICAL_RELATIONSHIP_LABELS[relationshipForChild(parent.type, type)!]}</div>}
    <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button><button disabled={!valid || pending} onClick={() => state.mode === "create" ? void onCreate({ parent: state.parent, type, nameEn: nameEn.trim(), nameAr: nameAr.trim(), ownerUserId }) : void onUpdate({ node: state.node, nameEn: nameEn.trim(), nameAr: nameAr.trim(), ownerUserId })} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{pending ? "Saving…" : state.mode === "create" ? "Create Node" : "Save Changes"}</button></div></div></div>;
}
