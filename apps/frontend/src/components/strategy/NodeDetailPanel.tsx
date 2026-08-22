"use client";

import { useState } from "react";
import { Clock, Pencil, Plus, Trash2, X } from "lucide-react";
import { StrategyNode, StrategyNodeActivity, NodeType } from "@/types/strategy";
import { TYPE_CONFIG, STATUS_CONFIG } from "@/lib/strategyConfig";
import { collectIds } from "@/lib/treeUtils";

const TABS = ["Overview", "Structure", "Activity"] as const;

const PANEL_LEVEL_LABEL: Record<NodeType, string> = {
  plan: "Corp",
  perspective: "Strategic Theme",
  objective: "Objective",
  initiative: "Initiative",
  project: "Project",
};

const NEXT_LEVEL_TYPE: Record<NodeType, NodeType> = {
  plan: "perspective",
  perspective: "objective",
  objective: "initiative",
  initiative: "project",
  project: "project",
};

const STATUS_BADGE: Record<StrategyNode["status"], { bg: string; text: string }> = {
  "on-track": { bg: "bg-emerald-50", text: "text-emerald-700" },
  "at-risk": { bg: "bg-amber-50", text: "text-amber-700" },
  "off-track": { bg: "bg-red-50", text: "text-red-700" },
  "not-started": { bg: "bg-gray-100", text: "text-gray-600" },
};

function formatMonthYear(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ProgressRing({ percent }: { percent: number }) {
  const size = 72;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, percent)) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#2563eb"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-900">{percent}%</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <div className="mt-1 truncate text-sm font-medium text-gray-900">{children}</div>
    </div>
  );
}

interface Props {
  node: StrategyNode;
  isRoot: boolean;
  canManage: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onEdit: (node: StrategyNode) => void;
  onDelete: (node: StrategyNode) => void;
}

export default function NodeDetailPanel({ node, isRoot, canManage, onClose, onSelect, onAddChild, onEdit, onDelete }: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");

  const typeCfg = TYPE_CONFIG[node.type];
  const statusCfg = STATUS_CONFIG[node.status];
  const badge = STATUS_BADGE[node.status];
  const Icon = typeCfg.icon;
  const levelLabel = PANEL_LEVEL_LABEL[node.type];
  const nextLevelLabel = PANEL_LEVEL_LABEL[NEXT_LEVEL_TYPE[node.type]];

  const children = node.children ?? [];
  const directCount = children.length;
  const totalCount = collectIds(node).length - 1;

  const activity: StrategyNodeActivity[] = node.activity ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/30 lg:static lg:z-auto lg:block lg:w-[400px] lg:shrink-0 lg:bg-transparent"
      onClick={onClose}
    >
      <div
        data-testid="node-detail-panel"
        className="app-scroll flex h-full w-full max-w-md flex-col overflow-hidden bg-white shadow-xl lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:max-w-none lg:rounded-xl lg:border lg:border-gray-200 lg:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-100 px-5 pb-4 pt-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${typeCfg.bg}`}>
                <Icon className={`h-4 w-4 ${typeCfg.text}`} />
              </span>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">{levelLabel}</span>
            </div>
            <div className="flex items-center gap-1">
              {canManage && (
                <>
                  <button
                    onClick={() => onAddChild(node.id)}
                    title="Add child node"
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onEdit(node)}
                    title="Edit node"
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {!isRoot && (
                    <button
                      onClick={() => onDelete(node)}
                      title="Delete node"
                      className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </>
              )}
              <button onClick={onClose} title="Close" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <h2 className="mt-3 truncate text-lg font-bold text-gray-900">{node.name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${badge.bg} ${badge.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} /> {statusCfg.label}
            </span>
            <span className="text-gray-400">
              {formatMonthYear(node.startDate)} → {formatMonthYear(node.endDate)}
            </span>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <ProgressRing percent={node.progress} />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-500">Overall Progress</p>
                <p className="text-lg font-bold text-gray-900">{node.progress}%</p>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-blue-600" style={{ width: `${node.progress}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-xs text-gray-400">
                <span>0%</span>
                <span>Target: 100%</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-4 border-b border-gray-100">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-0.5 pb-2 text-sm font-medium ${
                  tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {tab === "Overview" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Owner">
                  <span className="flex items-center gap-2">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${node.owner.color}`}
                    >
                      {node.owner.initials}
                    </span>
                    <span className="truncate">{node.owner.name ?? node.owner.initials}</span>
                  </span>
                </Field>
                <Field label="Budget">{node.budget ?? "—"}</Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Start Date">{formatMonthYear(node.startDate)}</Field>
                <Field label="End Date">{formatMonthYear(node.endDate)}</Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Children">
                  {directCount} direct · {totalCount} total
                </Field>
                <Field label="Level">
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                    <Icon className="h-3 w-3" /> {levelLabel}
                  </span>
                </Field>
              </div>

              {!!node.linkedKpis?.length && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Linked KPIs</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {node.linkedKpis.map((kpi) => (
                      <span key={kpi} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                        {kpi}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Description</p>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{node.description || "No description yet."}</p>
              </div>
            </>
          )}

          {tab === "Structure" && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {children.length} {children.length === 1 ? nextLevelLabel : `${nextLevelLabel}S`}
              </p>

              {children.length === 0 && <p className="text-sm text-gray-400">No child nodes yet.</p>}

              {children.map((child) => {
                const childCfg = TYPE_CONFIG[child.type];
                const childStatusCfg = STATUS_CONFIG[child.status];
                const childBadge = STATUS_BADGE[child.status];
                const ChildIcon = childCfg.icon;
                return (
                  <button
                    key={child.id}
                    data-testid={`structure-child-${child.id}`}
                    onClick={() => onSelect(child.id)}
                    className="w-full rounded-xl border border-gray-100 p-3 text-left hover:border-gray-200 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${childCfg.bg}`}>
                          <ChildIcon className={`h-3.5 w-3.5 ${childCfg.text}`} />
                        </span>
                        <span className="truncate text-sm font-medium text-gray-900">{child.name}</span>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${childBadge.bg} ${childBadge.text}`}>
                        {childStatusCfg.label}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div className={`h-full rounded-full ${childStatusCfg.bar}`} style={{ width: `${child.progress}%` }} />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs text-gray-500">{child.progress}%</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {tab === "Activity" && (
            <div className="space-y-4">
              {activity.length === 0 && <p className="text-sm text-gray-400">No activity recorded yet.</p>}
              {activity.map((entry) => (
                <div key={entry.id} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                    <Clock className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{entry.message}</p>
                    <p className="text-xs text-gray-400">
                      by {entry.actor} · {timeAgo(entry.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {canManage && (
          <div className="border-t border-gray-100 p-4">
            <button
              onClick={() => onAddChild(node.id)}
              className="flex w-full items-center justify-center gap-1.5 rounded-full border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Plus className="h-4 w-4" /> Add {nextLevelLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
