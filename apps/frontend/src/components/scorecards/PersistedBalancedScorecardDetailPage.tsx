"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import type { Kpi, Perspective, PerspectiveKey, Scorecard } from "@/types/scorecard";
import { KPI_STATUS_DOT, scoreColor } from "@/lib/scorecardConfig";

const PERSPECTIVE_ORDER: PerspectiveKey[] = [
  "financial",
  "customer",
  "internal-process",
  "learning-growth",
];

const PERSPECTIVE_UI = {
  financial: {
    label: "Financial",
    icon: TrendingUp,
    iconBg: "bg-sky-100",
    iconText: "text-sky-500",
    text: "text-sky-500",
    bar: "bg-sky-500",
    activeTab: "bg-sky-500 text-white border-sky-500",
    activeCard: "border-sky-300 bg-sky-50 shadow-sm",
    section: "border-sky-200",
    sectionHeader: "bg-sky-50",
  },
  customer: {
    label: "Customer",
    icon: Users,
    iconBg: "bg-emerald-100",
    iconText: "text-emerald-500",
    text: "text-emerald-500",
    bar: "bg-emerald-500",
    activeTab: "bg-emerald-500 text-white border-emerald-500",
    activeCard: "border-emerald-300 bg-emerald-50 shadow-sm",
    section: "border-emerald-200",
    sectionHeader: "bg-emerald-50",
  },
  "internal-process": {
    label: "Internal Process",
    icon: Activity,
    iconBg: "bg-orange-100",
    iconText: "text-orange-500",
    text: "text-orange-500",
    bar: "bg-orange-500",
    activeTab: "bg-orange-500 text-white border-orange-500",
    activeCard: "border-orange-300 bg-orange-50 shadow-sm",
    section: "border-orange-200",
    sectionHeader: "bg-orange-50",
  },
  "learning-growth": {
    label: "Learning & Growth",
    icon: Zap,
    iconBg: "bg-indigo-100",
    iconText: "text-indigo-500",
    text: "text-indigo-500",
    bar: "bg-indigo-500",
    activeTab: "bg-indigo-500 text-white border-indigo-500",
    activeCard: "border-indigo-300 bg-indigo-50 shadow-sm",
    section: "border-indigo-200",
    sectionHeader: "bg-indigo-50",
  },
} as const;

function toScorecard(row: unknown): Scorecard | null {
  if (typeof row !== "object" || row === null) return null;
  const record = row as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.name !== "string" ||
    typeof record.department !== "string" ||
    typeof record.period !== "string" ||
    typeof record.ownerName !== "string" ||
    typeof record.score !== "number" ||
    !Array.isArray(record.perspectives)
  ) return null;
  if (record.status !== "on-track" && record.status !== "at-risk" && record.status !== "draft") return null;
  return record as unknown as Scorecard;
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return <span className="text-xs text-gray-300">—</span>;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((value, index) => `${(index / (data.length - 1)) * 100},${24 - ((value - min) / range) * 20}`)
    .join(" ");

  return (
    <svg viewBox="0 0 100 26" preserveAspectRatio="none" className="h-6 w-14 text-sky-500" aria-label="KPI trend">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function varianceTone(variance?: string) {
  const value = variance?.trim();
  if (!value || value === "—") return "bg-gray-100 text-gray-500";
  if (value.startsWith("-") || value.startsWith("-$")) return "bg-red-50 text-red-600";
  if (value.startsWith("+")) return "bg-emerald-50 text-emerald-700";
  return "bg-gray-100 text-gray-600";
}

function statusSummary(kpis: Kpi[]) {
  return {
    onTrack: kpis.filter((kpi) => kpi.status === "on-track").length,
    atRisk: kpis.filter((kpi) => kpi.status === "at-risk").length,
    behind: kpis.filter((kpi) => kpi.status === "draft").length,
  };
}

function initialsForName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function kpiOwnerLabel(kpi: Kpi, scorecardOwnerName: string) {
  return initialsForName(scorecardOwnerName) === kpi.owner.initials.toUpperCase()
    ? scorecardOwnerName
    : kpi.owner.initials;
}

function kpiStatusDescription(status: Kpi["status"]) {
  if (status === "on-track") return "On or above target.";
  if (status === "at-risk") return "Below target; attention required.";
  return "Not yet assessed.";
}

function PerspectiveSection({
  perspective,
  ownerName,
  strategicObjective,
  expanded,
  onToggle,
}: {
  perspective: Perspective;
  ownerName: string;
  strategicObjective?: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const ui = PERSPECTIVE_UI[perspective.key];
  const Icon = ui.icon;
  const counts = statusSummary(perspective.kpis);
  const [expandedKpiIds, setExpandedKpiIds] = useState<Set<string>>(new Set());

  const toggleKpi = (id: string) => {
    setExpandedKpiIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className={`overflow-hidden rounded-xl border bg-white ${ui.section}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={`flex w-full flex-wrap items-center justify-between gap-2.5 px-4 py-3 text-left ${ui.sectionHeader}`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${ui.iconBg}`}>
            <Icon className={`h-4 w-4 ${ui.iconText}`} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[15px] font-semibold text-gray-900">{ui.label}</span>
              <span className="text-xs text-gray-500">Weight: {perspective.weight}%</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2.5 text-xs">
              <span className="text-gray-500">Score: <span className={`font-semibold ${ui.text}`}>{perspective.score}%</span></span>
              {counts.onTrack > 0 && <span className="text-emerald-700">{counts.onTrack} on track</span>}
              {counts.atRisk > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">{counts.atRisk} at risk</span>}
              {counts.behind > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-600">{counts.behind} behind</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 sm:flex">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/80">
              <div className={`h-full rounded-full ${ui.bar}`} style={{ width: `${Math.min(100, Math.max(0, perspective.score))}%` }} />
            </div>
            <span className={`w-9 text-right text-xs font-semibold ${ui.text}`}>{perspective.score}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold text-white ${perspective.owner.color}`}>
              {perspective.owner.initials}
            </span>
            <span className="hidden text-xs text-gray-600 md:inline">{ownerName}</span>
          </div>
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-500" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-500" />}
        </div>
      </button>

      {expanded && (
        perspective.kpis.length === 0 ? (
          <div className="border-t border-gray-100 px-4 py-6 text-center text-sm text-gray-400">No KPIs in this perspective.</div>
        ) : (
          <div className="overflow-hidden border-t border-gray-100">
            <table className="w-full table-fixed text-[12px]">
              <colgroup>
                <col className="w-[4%]" />
                <col className="w-[6%]" />
                <col className="w-[24%]" />
                <col className="w-[8%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[10%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-100 bg-white text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                  <th className="px-2 py-2.5"></th>
                  <th className="py-2.5 pr-2">Status</th>
                  <th className="py-2.5 pr-2">KPI Name</th>
                  <th className="py-2.5 pr-2 text-right">Weight</th>
                  <th className="py-2.5 pr-2 text-right">Actual</th>
                  <th className="py-2.5 pr-2 text-right">Target</th>
                  <th className="py-2.5 pr-2 text-right">Variance</th>
                  <th className="py-2.5 pr-2">Progress</th>
                  <th className="py-2.5 pr-2">Trend</th>
                  <th className="py-2.5 pr-2 text-right">Owner</th>
                </tr>
              </thead>
              <tbody>
                {perspective.kpis.map((kpi) => {
                  const progress = scoreColor(kpi.score);
                  const kpiExpanded = expandedKpiIds.has(kpi.id);
                  return (
                    <Fragment key={kpi.id}>
                      <tr
                        tabIndex={0}
                        role="button"
                        aria-expanded={kpiExpanded}
                        onClick={() => toggleKpi(kpi.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleKpi(kpi.id);
                          }
                        }}
                        className="cursor-pointer border-b border-gray-50 hover:bg-gray-50/70 focus:bg-gray-50 focus:outline-none"
                      >
                        <td className="px-2 py-2.5 text-gray-400">
                          {kpiExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </td>
                        <td className="py-2.5 pr-2"><span className={`block h-2.5 w-2.5 rounded-full ${KPI_STATUS_DOT[kpi.status]}`} /></td>
                        <td className="break-words py-2.5 pr-2 font-semibold leading-4 text-gray-900">{kpi.name}</td>
                        <td className="py-2.5 pr-2 text-right text-gray-500">{kpi.weight != null ? `${kpi.weight}%` : "—"}</td>
                        <td className="py-2.5 pr-2 text-right font-medium text-gray-900">{kpi.actual ?? "—"}</td>
                        <td className="py-2.5 pr-2 text-right text-gray-500">{kpi.target ?? "—"}</td>
                        <td className="py-2.5 pr-2 text-right"><span className={`inline-block max-w-full rounded-full px-1.5 py-0.5 text-[11px] font-medium ${varianceTone(kpi.variance)}`}>{kpi.variance ?? "—"}</span></td>
                        <td className="py-2.5 pr-2">
                          <div className="h-1.5 w-full max-w-16 overflow-hidden rounded-full bg-gray-100">
                            <div className={`h-full rounded-full ${progress.bar}`} style={{ width: `${Math.min(100, Math.max(0, kpi.score))}%` }} />
                          </div>
                        </td>
                        <td className="py-2.5 pr-2"><Sparkline data={kpi.trend ?? []} /></td>
                        <td className="py-2.5 pr-2 text-right">
                          <span className={`ml-auto flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold text-white ${kpi.owner.color}`}>
                            {kpi.owner.initials}
                          </span>
                        </td>
                      </tr>

                      {kpiExpanded && (
                        <tr className="border-b border-gray-100 bg-white">
                          <td colSpan={10} className="px-5 py-3">
                            <div className="grid items-start gap-4 sm:grid-cols-[120px_minmax(320px,1fr)_220px]">
                              <div>
                                <p className="text-xs font-semibold text-gray-900">Owner</p>
                                <p className="mt-1 text-xs text-gray-500">{kpiOwnerLabel(kpi, ownerName)}</p>
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-gray-900">Linked Objectives</p>
                                {strategicObjective ? (
                                  <span className="mt-1 inline-flex max-w-full items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium leading-4 text-sky-700">
                                    <span className="whitespace-normal">◎ {strategicObjective}</span>
                                  </span>
                                ) : (
                                  <p className="mt-1 text-xs text-gray-400">—</p>
                                )}
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-gray-900">Status</p>
                                <p className="mt-1 text-xs text-gray-500">{kpiStatusDescription(kpi.status)}</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </section>
  );
}

export default function PersistedBalancedScorecardDetailPage({ scorecardId }: { scorecardId: string }) {
  const router = useRouter();
  const balancedListQuery = trpc.scorecard.balanced.list.useQuery();
  const scorecard = useMemo(
    () => (balancedListQuery.data ?? [])
      .map(toScorecard)
      .filter((row): row is Scorecard => row !== null)
      .find((row) => row.id === scorecardId),
    [balancedListQuery.data, scorecardId],
  );

  const orderedPerspectives = useMemo(
    () => scorecard
      ? PERSPECTIVE_ORDER.map((key) => scorecard.perspectives.find((perspective) => perspective.key === key)).filter((row): row is Perspective => Boolean(row))
      : [],
    [scorecard],
  );

  const [activePerspectiveKey, setActivePerspectiveKey] = useState<PerspectiveKey | "all">("all");
  const [expandedPerspectiveIds, setExpandedPerspectiveIds] = useState<Set<string>>(new Set());

  const visiblePerspectives = useMemo(
    () => orderedPerspectives.filter((perspective) => activePerspectiveKey === "all" || perspective.key === activePerspectiveKey),
    [activePerspectiveKey, orderedPerspectives],
  );

  const totalKpis = scorecard?.perspectives.reduce((sum, perspective) => sum + perspective.kpis.length, 0) ?? 0;

  const selectPerspective = (perspective: Perspective) => {
    setActivePerspectiveKey(perspective.key);
    setExpandedPerspectiveIds(new Set([perspective.id]));
  };

  const selectAll = () => {
    setActivePerspectiveKey("all");
    const first = orderedPerspectives[0];
    setExpandedPerspectiveIds(first ? new Set([first.id]) : new Set());
  };

  const togglePerspective = (id: string) => {
    setExpandedPerspectiveIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportScorecard = () => {
    if (!scorecard) return;
    const blob = new Blob([JSON.stringify(scorecard, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${scorecard.name.replace(/\s+/g, "-").toLowerCase()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (balancedListQuery.isLoading) {
    return <div className="p-6 text-sm text-gray-500">Loading scorecard…</div>;
  }

  if (balancedListQuery.error) {
    return <div className="p-6 text-sm text-red-600">{balancedListQuery.error.message}</div>;
  }

  if (!scorecard) {
    return (
      <div className="mx-auto max-w-2xl p-6 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Scorecard not found</h1>
        <Link href="/balanced-scorecards" className="mt-4 inline-flex items-center gap-1 text-sm text-sky-600">
          <ChevronLeft className="h-4 w-4" /> Back to Balanced Scorecards
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50/70">
      <div className="border-b border-gray-200 bg-white px-3 py-3 sm:px-5">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link href="/balanced-scorecards" aria-label="Back to Balanced Scorecards" className="rounded-full p-1 text-gray-500 hover:bg-gray-100">
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-500">
              <TrendingUp className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-base font-semibold">
                <Link href="/balanced-scorecards" className="text-sky-500 hover:text-sky-600">Balanced Scorecards</Link>
                <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                <span className="truncate text-gray-900">{scorecard.name}</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">{totalKpis} KPIs · {scorecard.period} · Owner: {scorecard.ownerName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={exportScorecard} className="flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Download className="h-3.5 w-3.5" /> Export
            </button>
            <button type="button" onClick={() => router.push("/balanced-scorecards")} className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700">
              <Plus className="h-3.5 w-3.5" /> New Scorecard
            </button>
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 px-3 py-2.5 backdrop-blur sm:px-5">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className={`rounded-xl border px-3 py-1.5 text-sm font-medium ${activePerspectiveKey === "all" ? "border-slate-900 bg-slate-900 text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              All Perspectives
            </button>
            {orderedPerspectives.map((perspective) => {
              const ui = PERSPECTIVE_UI[perspective.key];
              const Icon = ui.icon;
              const active = activePerspectiveKey === perspective.key;
              return (
                <button
                  key={perspective.id}
                  type="button"
                  onClick={() => selectPerspective(perspective)}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium ${active ? ui.activeTab : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  <Icon className="h-3.5 w-3.5" /> {ui.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> On Track</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> At Risk</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> Behind</span>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1600px] px-3 py-5 sm:px-5">
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {orderedPerspectives.map((perspective) => {
            const ui = PERSPECTIVE_UI[perspective.key];
            const Icon = ui.icon;
            const counts = statusSummary(perspective.kpis);
            const active = activePerspectiveKey === perspective.key;
            return (
              <button
                key={perspective.id}
                type="button"
                onClick={() => selectPerspective(perspective)}
                className={`rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${active ? ui.activeCard : "border-gray-200 bg-white"}`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${ui.iconBg}`}>
                    <Icon className={`h-4 w-4 ${ui.iconText}`} />
                  </span>
                  <span className="text-sm font-semibold text-gray-900">{ui.label}</span>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <span className={`text-2xl font-medium ${ui.text}`}>{perspective.score}%</span>
                  <span className="text-[11px] text-gray-400">{counts.onTrack}/{perspective.kpis.length} KPIs</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div className={`h-full rounded-full ${ui.bar}`} style={{ width: `${Math.min(100, Math.max(0, perspective.score))}%` }} />
                </div>
                <p className="mt-1.5 text-[11px] text-gray-400">Weight: {perspective.weight}%</p>
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          {visiblePerspectives.map((perspective, index) => (
            <PerspectiveSection
              key={perspective.id}
              perspective={perspective}
              ownerName={scorecard.ownerName}
              strategicObjective={scorecard.strategicObjective}
              expanded={expandedPerspectiveIds.has(perspective.id) || (expandedPerspectiveIds.size === 0 && index === 0)}
              onToggle={() => togglePerspective(perspective.id)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
