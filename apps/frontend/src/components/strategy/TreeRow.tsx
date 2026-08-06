"use client";

import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { StrategyNode } from "@/types/strategy";
import { TYPE_CONFIG, STATUS_CONFIG } from "@/lib/strategyConfig";

interface Props {
  node: StrategyNode;
  depth: number;
  lines: boolean[]; // for columns 0..depth-2: whether an ancestor's line continues past this row
  hasNextSibling: boolean; // controls this node's own elbow bottom-half
  expandedIds: Set<string>;
  forceExpanded: boolean; // true while search/filter is active
  onToggle: (id: string) => void;
  onAddChild: (parentId: string) => void;
}

const ROW_H = 52; // px, keep in sync with h-[52px] below

export default function TreeRow({ node, depth, lines, hasNextSibling, expandedIds, forceExpanded, onToggle, onAddChild }: Props) {
  const hasChildren = !!node.children?.length;
  const isOpen = forceExpanded || expandedIds.has(node.id);
  const typeCfg = TYPE_CONFIG[node.type];
  const statusCfg = STATUS_CONFIG[node.status];
  const Icon = typeCfg.icon;

  return (
    <div>
      <div className="group flex items-stretch border-b border-gray-100 hover:bg-gray-50" style={{ height: ROW_H }}>
        {/* connector columns */}
        {depth > 0 &&
          Array.from({ length: depth }).map((_, k) => {
            const isElbow = k === depth - 1;
            return (
              <div key={k} className="relative w-6 shrink-0">
                {isElbow ? (
                  <>
                    <span className="absolute left-1/2 top-0 h-1/2 w-px -translate-x-1/2 bg-gray-200" />
                    {hasNextSibling && <span className="absolute left-1/2 top-1/2 h-1/2 w-px -translate-x-1/2 bg-gray-200" />}
                    <span className="absolute left-1/2 top-1/2 h-px w-3 -translate-y-1/2 bg-gray-200" />
                  </>
                ) : (
                  lines[k] && <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gray-200" />
                )}
              </div>
            );
          })}

        {/* expand/collapse chevron */}
        <div className="flex w-6 shrink-0 items-center justify-center">
          {hasChildren ? (
            <button onClick={() => onToggle(node.id)} className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : null}
        </div>

        {/* main content */}
        <div className="flex flex-1 items-center justify-between gap-4 pr-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${typeCfg.bg}`}>
              <Icon className={`h-3.5 w-3.5 ${typeCfg.text}`} />
            </span>
            <span className="truncate text-[15px] text-gray-900">{node.name}</span>
            <button
              onClick={() => onAddChild(node.id)}
              title="Add child node"
              className="ml-1 hidden shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 group-hover:inline-flex"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-6">
            <div className="flex items-center gap-2 w-20">
              <span className={`h-2 w-2 rounded-full ${statusCfg.dot}`} title={statusCfg.label} />
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ${node.owner.color}`}>
                {node.owner.initials}
              </span>
            </div>
            <div className="flex items-center gap-2 w-36">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full ${statusCfg.bar}`} style={{ width: `${node.progress}%` }} />
              </div>
              <span className="w-9 text-right text-sm text-gray-600">{node.progress}%</span>
            </div>
          </div>
        </div>
      </div>

      {hasChildren && isOpen && (
        <div>
          {node.children!.map((child, idx) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              lines={[...lines, hasNextSibling]}
              hasNextSibling={idx < node.children!.length - 1}
              expandedIds={expandedIds}
              forceExpanded={forceExpanded}
              onToggle={onToggle}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}
