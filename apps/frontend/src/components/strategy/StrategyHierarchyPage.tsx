"use client";

import { useMemo, useState } from "react";
import {
  Search, Download, Share2, Sparkles, Plus,
  Maximize2, Minimize2, LayoutList, Network,
} from "lucide-react";
import { StrategyNode, NodeType, NodeStatus } from "@/types/strategy";
import { TYPE_CONFIG, STATUS_CONFIG } from "@/lib/strategyConfig";
import { initialStrategyData } from "@/data/mockStrategyData";
import { addChild, collectIds, filterTree, flatten, isFiltering, Filters } from "@/lib/treeUtils";
import TreeRow from "./TreeRow";
import AddNodeModal from "./AddNodeModal";

export default function StrategyHierarchyPage() {
  const [tree, setTree] = useState<StrategyNode>(initialStrategyData);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(["plan-1", "pillar-revenue", "obj-drive-revenue", "init-enterprise-sales"])
  );
  const [view, setView] = useState<"tree" | "list">("tree");
  const [filters, setFilters] = useState<Filters>({ search: "", type: "all", status: "all" });
  const [modalParentId, setModalParentId] = useState<string | null>(null);

  const totalNodes = useMemo(() => collectIds(tree).length, [tree]);
  const filteredTree = useMemo(() => filterTree(tree, filters), [tree, filters]);
  const filtering = isFiltering(filters);

  const toggle = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const expandAll = () => setExpandedIds(new Set(collectIds(tree)));
  const collapseAll = () => setExpandedIds(new Set());

  const handleAdd = (parentId: string, node: StrategyNode) => {
    setTree((prev) => addChild(prev, parentId, node));
    setExpandedIds((prev) => new Set(prev).add(parentId));
  };

  const exportJson = () => {
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
    <div className="p-4 sm:p-6">
      {/* header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold text-gray-900">Strategy Hierarchy</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your complete organizational strategy · {totalNodes} nodes
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={exportJson} className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Download className="h-4 w-4" /> Export
          </button>
          <button className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Share2 className="h-4 w-4" /> Share
          </button>
          <button className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90">
            <Sparkles className="h-4 w-4" /> Generate Strategy Brief
          </button>
          <button
            onClick={() => setModalParentId(tree.id)}
            className="flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" /> Add Node
          </button>
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

      {/* table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <span>Name</span>
          <div className="hidden items-center gap-6 md:flex">
            <span className="w-20">Own</span>
            <span className="w-36">Progress</span>
          </div>
        </div>

        {!filteredTree && (
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
            onAddChild={(id) => setModalParentId(id)}
          />
        )}

        {filteredTree && view === "list" &&
          listRows.map(({ node }) => {
            const typeCfg = TYPE_CONFIG[node.type];
            const statusCfg = STATUS_CONFIG[node.status];
            const Icon = typeCfg.icon;
            return (
              <div key={node.id} className="flex flex-col gap-1.5 border-b border-gray-100 px-4 py-2.5 hover:bg-gray-50 md:h-[52px] md:flex-row md:items-center md:justify-between md:gap-4 md:py-0">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${typeCfg.bg}`}>
                    <Icon className={`h-3.5 w-3.5 ${typeCfg.text}`} />
                  </span>
                  <span className="truncate text-[15px] text-gray-900">{node.name}</span>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">{typeCfg.label}</span>
                </div>
                <div className="flex items-center gap-3 pl-9 sm:gap-4 md:shrink-0 md:gap-6 md:pl-0">
                  <div className="flex items-center gap-2 md:w-20">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${statusCfg.dot}`} />
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${node.owner.color}`}>
                      {node.owner.initials}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-2 md:w-36 md:flex-none">
                    <div className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-gray-100 sm:w-16 md:w-24">
                      <div className={`h-full rounded-full ${statusCfg.bar}`} style={{ width: `${node.progress}%` }} />
                    </div>
                    <span className="w-9 shrink-0 text-right text-sm text-gray-600">{node.progress}%</span>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {modalParentId && (
        <AddNodeModal
          tree={tree}
          defaultParentId={modalParentId}
          onClose={() => setModalParentId(null)}
          onAdd={handleAdd}
        />
      )}
    </div>
  );
}
