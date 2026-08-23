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
  canAddChild: boolean;
  onAddChild: (parentId: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// Reference row height on desktop, where rows are single-line — connector
// elbows anchor to this fixed midpoint so they still line up with the icon
// when a row grows taller (mobile's stacked meta line).
const ELBOW_Y = 26;

export default function TreeRow({ node, depth, lines, hasNextSibling, expandedIds, forceExpanded, onToggle, canAddChild, onAddChild, selectedId, onSelect }: Props) {
  const hasChildren = !!node.children?.length;
  const isOpen = forceExpanded || expandedIds.has(node.id);
  const typeCfg = TYPE_CONFIG[node.type];
  const statusCfg = STATUS_CONFIG[node.status];
  const Icon = typeCfg.icon;
  const isSelected = node.id === selectedId;

  return (
    <div>
      <div
        onClick={() => onSelect(node.id)}
        className={`group flex min-h-[52px] cursor-pointer items-stretch border-b border-gray-100 hover:bg-gray-50 md:h-[52px] ${isSelected ? "bg-indigo-50/70 hover:bg-indigo-50/70" : ""}`}
      >
        {/* connector columns */}
        {depth > 0 &&
          Array.from({ length: depth }).map((_, k) => {
            const isElbow = k === depth - 1;
            return (
              <div key={k} className="relative w-4 shrink-0 md:w-6">
                {isElbow ? (
                  <>
                    <span className="absolute left-1/2 top-0 w-px -translate-x-1/2 bg-gray-200" style={{ height: ELBOW_Y }} />
                    {hasNextSibling && (
                      <span className="absolute left-1/2 bottom-0 w-px -translate-x-1/2 bg-gray-200" style={{ top: ELBOW_Y }} />
                    )}
                    <span className="absolute left-1/2 h-px w-2.5 -translate-y-1/2 bg-gray-200 md:w-3" style={{ top: ELBOW_Y }} />
                  </>
                ) : (
                  lines[k] && <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gray-200" />
                )}
              </div>
            );
          })}

        {/* expand/collapse chevron — anchored to ELBOW_Y so it stays aligned
            with the icon row even when mobile's stacked meta line makes the
            row taller than the desktop single-line height */}
        <div className="relative w-6 shrink-0">
          {hasChildren && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
              style={{ top: ELBOW_Y }}
              className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
            >
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
        </div>

        {/* main content */}
        <div className="flex flex-1 flex-col gap-1.5 pb-2 pt-3 pr-3 md:flex-row md:items-center md:justify-between md:gap-4 md:py-0 md:pr-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${typeCfg.bg}`}>
              <Icon className={`h-3.5 w-3.5 ${typeCfg.text}`} />
            </span>
            <span className="truncate text-[15px] text-gray-900">{node.name}</span>
            {canAddChild && (
              <button
                onClick={(e) => { e.stopPropagation(); onAddChild(node.id); }}
                title="Add child node"
                className="ml-1 hidden shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 group-hover:inline-flex"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 pl-[38px] md:shrink-0 md:gap-6 md:pl-0">
            <div className="flex shrink-0 items-center gap-2 md:w-20">
              <span className={`h-2 w-2 shrink-0 rounded-full ${statusCfg.dot}`} title={statusCfg.label} />
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
              canAddChild={canAddChild}
              onAddChild={onAddChild}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
