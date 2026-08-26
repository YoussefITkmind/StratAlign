"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  CircleDot,
  GitBranch,
  Layers3,
  Link2,
  Network,
  UserRound,
  X,
} from "lucide-react";
import {
  CANONICAL_NODE_TYPE_LABELS,
  CANONICAL_RELATIONSHIP_LABELS,
  type CanonicalStrategyEdge,
  type CanonicalStrategyNode,
} from "@/lib/canonicalStrategyHierarchy";

type DetailTab = "overview" | "structure" | "activity";

type PlanSummary = {
  id: string;
  name: string;
  status: string;
  opensAt?: Date | string | null;
  closesAt?: Date | string | null;
};

type InitiativeSummary = {
  id: string;
  nameEn: string;
  strategicPlayNodeId: string;
  stage: string;
  latestStatus: string | null;
};

interface Props {
  node: CanonicalStrategyNode;
  plan: PlanSummary;
  nodes: readonly CanonicalStrategyNode[];
  edges: readonly CanonicalStrategyEdge[];
  peopleById: Map<string, string>;
  initiatives: readonly InitiativeSummary[];
  onClose: () => void;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function StrategyNodeDetailPanel({
  node,
  plan,
  nodes,
  edges,
  peopleById,
  initiatives,
  onClose,
}: Props) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const nodeById = useMemo(() => new Map(nodes.map((item) => [item.id, item])), [nodes]);

  const incoming = useMemo(
    () => edges.filter((edge) => edge.toNodeId === node.id),
    [edges, node.id],
  );
  const outgoing = useMemo(
    () => edges.filter((edge) => edge.fromNodeId === node.id),
    [edges, node.id],
  );

  const directChildren = useMemo(() => {
    const seen = new Set<string>();
    return outgoing
      .map((edge) => ({ edge, node: nodeById.get(edge.toNodeId) }))
      .filter((entry): entry is { edge: CanonicalStrategyEdge; node: CanonicalStrategyNode } => Boolean(entry.node))
      .filter((entry) => {
        if (seen.has(entry.node.id)) return false;
        seen.add(entry.node.id);
        return true;
      });
  }, [nodeById, outgoing]);

  const parentLinks = useMemo(
    () => incoming
      .map((edge) => ({ edge, node: nodeById.get(edge.fromNodeId) }))
      .filter((entry): entry is { edge: CanonicalStrategyEdge; node: CanonicalStrategyNode } => Boolean(entry.node)),
    [incoming, nodeById],
  );

  const linkedPlayIds = useMemo(() => {
    if (node.type === "strategic_play") return new Set([node.id]);
    if (node.type === "objective") {
      return new Set(
        outgoing
          .filter((edge) => edge.edgeType === "executed_by")
          .map((edge) => edge.toNodeId),
      );
    }
    return new Set<string>();
  }, [node.id, node.type, outgoing]);

  const linkedInitiatives = useMemo(
    () => initiatives.filter((initiative) => linkedPlayIds.has(initiative.strategicPlayNodeId)),
    [initiatives, linkedPlayIds],
  );

  const creator = peopleById.get(node.createdBy) ?? "—";
  const active = node.state === "active";

  return (
    <aside className="sticky top-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
      <div className="border-b border-slate-100 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                {CANONICAL_NODE_TYPE_LABELS[node.type]}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                <CircleDot className="h-3 w-3" /> {statusLabel(node.state)}
              </span>
            </div>
            <h2 className="text-xl font-bold leading-snug text-slate-950">{node.nameEn}</h2>
            <p className="mt-1 text-xs text-slate-500">{plan.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close strategy details"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Strategy progress</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">Not measured at node level</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full border-4 border-slate-200 text-xs font-bold text-slate-400">—</div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full w-0 rounded-full bg-blue-600" />
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Progress will appear here when a canonical node metric is available.</p>
        </div>

        <div className="mt-4 flex border-b border-slate-100">
          {(["overview", "structure", "activity"] as DetailTab[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`border-b-2 px-3 py-2 text-sm font-medium capitalize transition ${tab === value ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && (
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <DetailItem icon={UserRound} label="Created by" value={creator} />
            <DetailItem icon={Network} label="Level" value={CANONICAL_NODE_TYPE_LABELS[node.type]} />
            <DetailItem icon={CalendarDays} label="Created" value={formatDate(node.createdAt)} />
            <DetailItem icon={GitBranch} label="Direct children" value={String(directChildren.length)} />
            <DetailItem icon={CircleDot} label="Node state" value={statusLabel(node.state)} />
            <DetailItem icon={CalendarDays} label="Plan opened" value={formatDate(plan.opensAt)} />
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Linked execution</p>
            {linkedInitiatives.length > 0 ? (
              <div className="mt-2 space-y-2">
                {linkedInitiatives.map((initiative) => (
                  <div key={initiative.id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                    <p className="text-sm font-semibold text-slate-800">{initiative.nameEn}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {statusLabel(initiative.stage)}{initiative.latestStatus ? ` · ${statusLabel(initiative.latestStatus)}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 rounded-xl border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400">
                No persisted initiatives are directly linked to this node.
              </p>
            )}
          </div>
        </div>
      )}

      {tab === "structure" && (
        <div className="space-y-5 p-5">
          <RelationshipSection title="Parent relationships" empty="This node has no incoming strategy relationships.">
            {parentLinks.map(({ edge, node: parent }) => (
              <RelationshipRow key={edge.id} name={parent.nameEn} relationship={CANONICAL_RELATIONSHIP_LABELS[edge.edgeType]} />
            ))}
          </RelationshipSection>
          <RelationshipSection title="Child relationships" empty="This node has no outgoing strategy relationships.">
            {directChildren.map(({ edge, node: child }) => (
              <RelationshipRow key={edge.id} name={child.nameEn} relationship={CANONICAL_RELATIONSHIP_LABELS[edge.edgeType]} />
            ))}
          </RelationshipSection>
        </div>
      )}

      {tab === "activity" && (
        <div className="p-5">
          <div className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <Activity className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-800">Node created</p>
              <p className="mt-0.5 text-xs text-slate-500">{formatDate(node.createdAt)} · {creator}</p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate-400">
            The canonical strategy API does not expose a full node activity feed yet, so no synthetic events are shown here.
          </p>
        </div>
      )}
    </aside>
  );
}

function DetailItem({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function RelationshipSection({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{title}</p>
      <div className="mt-2 space-y-2">
        {hasChildren ? children : <p className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400">{empty}</p>}
      </div>
    </div>
  );
}

function RelationshipRow({ name, relationship }: { name: string; relationship: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-slate-100 px-3 py-2.5">
      <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-800">{name}</p>
        <p className="mt-0.5 text-[11px] text-slate-400">{relationship}</p>
      </div>
    </div>
  );
}
