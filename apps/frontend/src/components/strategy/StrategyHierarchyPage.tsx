"use client";

import { useMemo, useState } from "react";
import {
  ChevronRight, Search, Download, Share2, Sparkles, Plus,
  Maximize2, Minimize2, LayoutList, Network, Loader2, AlertTriangle,
} from "lucide-react";
import { StrategyNode, NodeType, NodeStatus } from "@/types/strategy";
import { TYPE_CONFIG, STATUS_CONFIG } from "@/lib/strategyConfig";
import { collectIds, filterTree, flatten, isFiltering, findNode, Filters } from "@/lib/treeUtils";
import { trpc } from "@/lib/trpc/client";
import { usePublishAssistantContext } from "@/lib/assistant/assistant-context";
import TreeRow from "./TreeRow";
import AddNodeModal, { NodeFormValues } from "./AddNodeModal";
import NodeDetailPanel from "./NodeDetailPanel";

/** Bounded so a large hierarchy cannot blow the assistant's prompt budget. */
const MAX_ASSISTANT_CONTEXT_NODES = 30;

interface Props {
  canManageStrategy: boolean;
}

type ModalState = { mode: "add"; parentId: string } | { mode: "edit"; node: StrategyNode } | null;

export default function StrategyHierarchyPage({ canManageStrategy }: Props) {
  const utils = trpc.useUtils();
  const treeQuery = trpc.strategyHierarchy.tree.useQuery();
  const createMutation = trpc.strategyHierarchy.createNode.useMutation();
  const updateMutation = trpc.strategyHierarchy.updateNode.useMutation();
  const deleteMutation = trpc.strategyHierarchy.deleteNode.useMutation();

  const tree = (treeQuery.data ?? null) as StrategyNode | null;

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [hasAutoExpanded, setHasAutoExpanded] = useState(false);
  const [view, setView] = useState<"tree" | "list">("tree");
  const [filters, setFilters] = useState<Filters>({ search: "", type: "all", status: "all" });
  const [modal, setModal] = useState<ModalState>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (tree && !hasAutoExpanded) {
    setHasAutoExpanded(true);
    setExpandedIds(new Set(collectIds(tree)));
  }

  const totalNodes = useMemo(() => (tree ? collectIds(tree).length : 0), [tree]);
  const filteredTree = useMemo(() => (tree ? filterTree(tree, filters) : null), [tree, filters]);
  const filtering = isFiltering(filters);
  const selectedNode = tree && selectedId ? findNode(tree, selectedId) : null;

  const assistantEntity = useMemo(
    () =>
      selectedNode
        ? { type: selectedNode.type, id: selectedNode.id, name: selectedNode.name }
        : null,
    [selectedNode],
  );
  const assistantData = useMemo(() => {
    if (!tree) return null;
    return {
      rootName: tree.name,
      totalNodes,
      nodes: flatten(tree)
        .slice(0, MAX_ASSISTANT_CONTEXT_NODES)
        .map(({ node, depth }) => ({
          name: node.name,
          type: node.type,
          status: node.status,
          progress: node.progress,
          depth,
        })),
    };
  }, [tree, totalNodes]);
  usePublishAssistantContext("strategy_hierarchy", assistantEntity, assistantData);

  const toggle = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const expandAll = () => tree && setExpandedIds(new Set(collectIds(tree)));
  const collapseAll = () => setExpandedIds(new Set());

  const toDateOrUndefined = (value: string) => (value ? new Date(value) : undefined);
  const toDateOrNull = (value: string) => (value ? new Date(value) : null);

  const handleAdd = async (parentId: string, data: NodeFormValues) => {
    await createMutation.mutateAsync({
      parentId,
      name: data.name,
      type: data.type,
      status: data.status,
      progress: data.progress,
      ownerName: data.ownerName,
      budget: data.budget || undefined,
      startDate: toDateOrUndefined(data.startDate),
      endDate: toDateOrUndefined(data.endDate),
      description: data.description || undefined,
      linkedKpis: data.linkedKpis.length > 0 ? data.linkedKpis : undefined,
    });
    setExpandedIds((prev) => new Set(prev).add(parentId));
    await utils.strategyHierarchy.tree.invalidate();
  };

  const handleEdit = async (id: string, data: NodeFormValues) => {
    await updateMutation.mutateAsync({
      id,
      name: data.name,
      type: data.type,
      status: data.status,
      progress: data.progress,
      ownerName: data.ownerName,
      budget: data.budget || null,
      startDate: toDateOrNull(data.startDate),
      endDate: toDateOrNull(data.endDate),
      description: data.description || null,
      linkedKpis: data.linkedKpis,
    });
    await utils.strategyHierarchy.tree.invalidate();
  };

  const handleDelete = async (node: StrategyNode) => {
    const confirmed = window.confirm(`Delete "${node.name}" and all its child nodes? This cannot be undone.`);
    if (!confirmed) return;
    await deleteMutation.mutateAsync({ id: node.id });
    if (selectedId === node.id) setSelectedId(null);
    await utils.strategyHierarchy.tree.invalidate();
  };

  const exportJson = () => {
    if (!tree) return;
    const blob = new Blob([JSON.stringify(tree, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "strategy-hierarchy.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const listRows = useMemo(() => (filteredTree ? flatten(filteredTree) : []), [filteredTree]);

  return (
    <div className="w-full">
      <div className="p-6">
      {/* breadcrumb */}
      <div className="mb-4 flex items-center gap-1.5 text-sm text-gray-500">
        <span>Home</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900">Strategy Hierarchy</span>
      </div>

      {/* header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold text-gray-900">Strategy Hierarchy</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your complete organizational strategy · {totalNodes} nodes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportJson} className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Download className="h-4 w-4" /> Export
          </button>
          <button className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Share2 className="h-4 w-4" /> Share
          </button>
          <button className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90">
            <Sparkles className="h-4 w-4" /> Generate Strategy Brief
          </button>
          {canManageStrategy && (
            <button
              onClick={() => tree && setModal({ mode: "add", parentId: tree.id })}
              disabled={!tree}
              title={tree ? undefined : "Strategy data hasn't loaded yet"}
              className="flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-4 w-4" /> Add Node
            </button>
          )}
        </div>
      </div>

      {/* toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
            {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as NodeStatus | "all" }))}
            className="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 outline-none focus:border-indigo-500"
          >
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
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
            <button
              onClick={() => setView("tree")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${view === "tree" ? "bg-gray-900 text-white" : "text-gray-600"}`}
            >
              <Network className="h-3.5 w-3.5" /> Tree
            </button>
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${view === "list" ? "bg-gray-900 text-white" : "text-gray-600"}`}
            >
              <LayoutList className="h-3.5 w-3.5" /> List
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-6">
        {/* table */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <span>Name</span>
            <div className="hidden items-center gap-6 md:flex">
              <span className="w-20">Own</span>
              <span className="w-36">Progress</span>
            </div>
          </div>

          {treeQuery.isLoading && (
            <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading strategy hierarchy…
            </div>
          )}

          {treeQuery.isError && (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center text-sm text-red-500">
              <AlertTriangle className="h-5 w-5" />
              Couldn&apos;t load the strategy hierarchy. Please try again.
            </div>
          )}

          {!treeQuery.isLoading && !treeQuery.isError && !tree && (
            <div className="px-4 py-16 text-center text-sm text-gray-400">No strategy data yet.</div>
          )}

          {tree && !filteredTree && (
            <div className="px-4 py-16 text-center text-sm text-gray-400">No nodes match your filters.</div>
          )}

          {filteredTree && view === "tree" && (
            <TreeRow
              node={filteredTree}
              depth={0}
              lines={[]}
              hasNextSibling={false}
              expandedIds={expandedIds}
              forceExpanded={filtering}
              onToggle={toggle}
              canAddChild={canManageStrategy}
              onAddChild={(id) => setModal({ mode: "add", parentId: id })}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}

          {filteredTree && view === "list" &&
            listRows.map(({ node }) => {
              const typeCfg = TYPE_CONFIG[node.type];
              const statusCfg = STATUS_CONFIG[node.status];
              const Icon = typeCfg.icon;
              const isSelected = node.id === selectedId;
              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedId(node.id)}
                  className={`flex min-h-[52px] cursor-pointer flex-col justify-center gap-1.5 border-b border-gray-100 px-4 py-2.5 hover:bg-gray-50 md:h-[52px] md:flex-row md:items-center md:justify-between md:py-0 ${isSelected ? "bg-indigo-50/70 hover:bg-indigo-50/70" : ""}`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${typeCfg.bg}`}>
                      <Icon className={`h-3.5 w-3.5 ${typeCfg.text}`} />
                    </span>
                    <span className="truncate text-[15px] text-gray-900">{node.name}</span>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">{typeCfg.label}</span>
                  </div>
                  <div className="flex items-center gap-3 pl-[38px] md:shrink-0 md:gap-6 md:pl-0">
                    <div className="flex shrink-0 items-center gap-2 md:w-20">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${statusCfg.dot}`} />
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${node.owner.color}`}>
                        {node.owner.initials}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-1 items-center gap-2 md:w-36 md:flex-none">
                      <div className="h-1.5 min-w-[40px] flex-1 overflow-hidden rounded-full bg-gray-100 md:w-24 md:flex-none">
                        <div className={`h-full rounded-full ${statusCfg.bar}`} style={{ width: `${node.progress}%` }} />
                      </div>
                      <span className="w-9 shrink-0 text-right text-sm text-gray-600">{node.progress}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        {selectedNode && tree && (
          <NodeDetailPanel
            node={selectedNode}
            isRoot={selectedNode.id === tree.id}
            canManage={canManageStrategy}
            onClose={() => setSelectedId(null)}
            onSelect={setSelectedId}
            onAddChild={(parentId) => setModal({ mode: "add", parentId })}
            onEdit={(node) => setModal({ mode: "edit", node })}
            onDelete={handleDelete}
          />
        )}
      </div>
      </div>

      {canManageStrategy && modal?.mode === "add" && (
        <AddNodeModal
          tree={tree!}
          defaultParentId={modal.parentId}
          onClose={() => setModal(null)}
          onAdd={handleAdd}
          onEdit={handleEdit}
        />
      )}

      {canManageStrategy && modal?.mode === "edit" && (
        <AddNodeModal
          tree={tree!}
          defaultParentId={modal.node.id}
          editNode={modal.node}
          onClose={() => setModal(null)}
          onAdd={handleAdd}
          onEdit={handleEdit}
        />
      )}
    </div>
  );
}
