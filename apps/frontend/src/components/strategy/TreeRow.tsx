"use client";

import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import type { HierarchyTreeNode } from "@/lib/strategyTreeUtils";
import { TYPE_CONFIG, STATE_CONFIG } from "@/lib/strategyHierarchyConfig";

interface Props {
  node: HierarchyTreeNode;
  depth: number;
  lines: boolean[]; // for columns 0..depth-2: whether an ancestor's line continues past this row
  hasNextSibling: boolean; // controls this node's own elbow bottom-half
  expandedIds: Set<string>;
  forceExpanded: boolean; // true while search/filter is active
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
}

export default function TreeRow({ node, depth, lines, hasNextSibling, expandedIds, forceExpanded, selectedId, onToggle, onSelect, onAddChild }: Props) {
  const hasChildren = node.children.length > 0;
  const isOpen = forceExpanded || expandedIds.has(node.id);
  const typeCfg = TYPE_CONFIG[node.type];
  const stateCfg = STATE_CONFIG[node.state];
  const Icon = typeCfg.icon;

  return (
    <div>
      <div
        data-testid="persisted-strategy-node"
        onClick={() => onSelect(node.id)}
        className={`group flex cursor-pointer items-stretch border-b border-gray-100 hover:bg-gray-50 md:h-[52px] ${selectedId === node.id ? "bg-blue-50/60" : ""}`}
      >
        {/* connector columns */}
        {depth > 0 &&
          Array.from({ length: depth }).map((_, k) => {
            const isElbow = k === depth - 1;
            return (
              <div key={k} className="relative w-3 shrink-0 sm:w-4 md:w-6">
                {isElbow ? (
                  <>
                    <span className="absolute left-1/2 top-0 h-1/2 w-px -translate-x-1/2 bg-gray-200" />
                    {hasNextSibling && <span className="absolute left-1/2 top-1/2 h-1/2 w-px -translate-x-1/2 bg-gray-200" />}
                    <span className="absolute left-1/2 top-1/2 h-px w-2 -translate-y-1/2 bg-gray-200 md:w-3" />
                  </>
                ) : (
                  lines[k] && <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gray-200" />
                )}
              </div>
            );
          })}

        {/* expand/collapse chevron */}
        <div className="flex w-5 shrink-0 items-center justify-center sm:w-6">
          {hasChildren ? (
            <button onClick={(e) => { e.stopPropagation(); onToggle(node.id); }} className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : null}
        </div>

        {/* main content */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-2.5 pr-3 sm:pr-4 md:flex-row md:items-center md:justify-between md:gap-4 md:py-0">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${typeCfg.bg}`}>
              <Icon className={`h-3.5 w-3.5 ${typeCfg.text}`} />
            </span>
            <span className="truncate text-[15px] text-gray-900">{node.nameEn}</span>
            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">{typeCfg.label}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onAddChild(node.id); }}
              title="Add child node"
              className="ml-1 hidden shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 group-hover:inline-flex"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-2 pl-9 md:pl-0">
            <span className={`h-2 w-2 shrink-0 rounded-full ${stateCfg.dot}`} />
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${stateCfg.badgeBg} ${stateCfg.badgeText}`}>{stateCfg.label}</span>
          </div>
        </div>
      </div>

      {hasChildren && isOpen && (
        <div>
          {node.children.map((child, idx) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              lines={[...lines, hasNextSibling]}
              hasNextSibling={idx < node.children.length - 1}
              expandedIds={expandedIds}
              forceExpanded={forceExpanded}
              selectedId={selectedId}
              onToggle={onToggle}
              onSelect={onSelect}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}
