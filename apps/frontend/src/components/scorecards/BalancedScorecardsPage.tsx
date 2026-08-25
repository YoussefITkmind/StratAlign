"use client";

import { useMemo, useState } from "react";
import {
  Search, Download, Plus, BookOpen,
  Network, LayoutList,
} from "lucide-react";
import { Scorecard, Filters } from "@/types/scorecard";
import { SCORECARD_STATUS_CONFIG, scoreColor } from "@/lib/scorecardConfig";
import { filterScorecards, groupByDepartment, statusCounts, totalKpis } from "@/lib/scorecardUtils";
import { trpc } from "@/lib/trpc/client";
import { usePublishAssistantContext } from "@/lib/assistant/assistant-context";
import ScorecardRow from "./ScorecardRow";
import NewScorecardModal from "./NewScorecardModal";

const MAX_ASSISTANT_CONTEXT_SCORECARDS = 30;

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

function planId(row: unknown): string | null {
  if (typeof row !== "object" || row === null) return null;
  const value = (row as Record<string, unknown>).id;
  return typeof value === "string" ? value : null;
}

function planStatus(row: unknown): string {
  if (typeof row !== "object" || row === null) return "";
  const value = (row as Record<string, unknown>).status;
  return typeof value === "string" ? value.toLowerCase() : "";
}

export default function BalancedScorecardsPage() {
  const utils = trpc.useUtils();
  const balancedListQuery = trpc.scorecard.balanced.list.useQuery();
  const plansQuery = trpc.strategy.plans.useQuery();
  const createScorecard = trpc.scorecard.balanced.create.useMutation();

  const scorecards = useMemo(
    () => (balancedListQuery.data ?? []).map(toScorecard).filter((row): row is Scorecard => row !== null),
    [balancedListQuery.data],
  );

  const assistantData = useMemo(() => ({
    totalScorecards: scorecards.length,
    scorecards: scorecards.slice(0, MAX_ASSISTANT_CONTEXT_SCORECARDS).map((row) => ({ name: row.name })),
  }), [scorecards]);
  usePublishAssistantContext(
    "balanced_scorecards",
    null,
    balancedListQuery.data ? assistantData : null,
  );

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"tree" | "list">("tree");
  const [filters, setFilters] = useState<Filters>({ search: "", department: "all", status: "all" });
  const [modalOpen, setModalOpen] = useState(false);

  const departments = useMemo(() => Array.from(new Set(scorecards.map((s) => s.department))), [scorecards]);
  const counts = useMemo(() => statusCounts(scorecards), [scorecards]);
  const kpiCount = useMemo(() => totalKpis(scorecards), [scorecards]);
  const filtered = useMemo(() => filterScorecards(scorecards, filters), [scorecards, filters]);
  const grouped = useMemo(() => groupByDepartment(filtered), [filtered]);

  const toggle = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleAdd = async (sc: Scorecard) => {
    const plans = plansQuery.data ?? [];
    const activePlan = plans.find((row) => planStatus(row) === "active");
    const planVersionId = planId(activePlan) ?? planId(plans[0]);
    if (!planVersionId) throw new Error("A strategy plan version is required before creating a scorecard");

    const ownerInitials = sc.perspectives[0]?.owner.initials || sc.ownerName
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    const created = await createScorecard.mutateAsync({
      nameEn: sc.name,
      nameAr: sc.name,
      planVersionId,
      description: sc.description,
      department: sc.department,
      period: sc.period,
      ownerName: sc.ownerName,
      ownerInitials,
      status: sc.status,
      score: sc.score,
      priorScore: sc.priorScore,
      reviewFrequency: sc.reviewFrequency,
      startDate: sc.startDate,
      endDate: sc.endDate,
      strategyName: sc.strategyName,
      strategicTheme: sc.strategicTheme,
      strategicObjective: sc.strategicObjective,
      primaryPerspective: sc.primaryPerspective,
      strategicWeight: sc.strategicWeight,
      tags: sc.tags,
      notes: sc.notes,
      perspectives: sc.perspectives.map((perspective) => ({
        key: perspective.key,
        owner: perspective.owner,
        score: perspective.score,
        priorScore: perspective.priorScore,
        weight: perspective.weight,
        kpis: perspective.kpis.map((kpi) => ({
          name: kpi.name,
          status: kpi.status,
          owner: kpi.owner,
          score: kpi.score,
          priorScore: kpi.priorScore,
          weight: kpi.weight,
          actual: kpi.actual,
          target: kpi.target,
          variance: kpi.variance,
          trend: kpi.trend,
        })),
      })),
    });

    if (typeof created === "object" && created !== null && typeof (created as Record<string, unknown>).id === "string") {
      setExpandedIds((prev) => new Set(prev).add((created as Record<string, unknown>).id as string));
    }
    await utils.scorecard.balanced.list.invalidate();
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(scorecards, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "balanced-scorecards.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50">
            <BookOpen className="h-5 w-5 text-blue-600" />
          </span>
          <div>
            <h1 className="text-[22px] font-bold text-gray-900">Balanced Scorecards</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {scorecards.length} scorecards · {kpiCount} KPIs tracked
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-full border border-gray-200 bg-gray-50 p-1">
            <button
              onClick={() => setView("tree")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${view === "tree" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
            >
              <Network className="h-3.5 w-3.5" /> Tree
            </button>
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${view === "list" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
            >
              <LayoutList className="h-3.5 w-3.5" /> List
            </button>
          </div>
          <button onClick={exportJson} className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Download className="h-4 w-4" /> Export
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" /> New Scorecard
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search scorecards..."
              className="w-64 rounded-full border border-gray-300 py-2 pl-9 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <select
            value={filters.department}
            onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))}
            className="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 outline-none focus:border-indigo-500"
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as Filters["status"] }))}
            className="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 outline-none focus:border-indigo-500"
          >
            <option value="all">All Statuses</option>
            {Object.entries(SCORECARD_STATUS_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            {counts.onTrack} On Track
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
            {counts.atRisk} At Risk
          </span>
          <span className="rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
            {counts.draft} Draft
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <span>Scorecard / Perspective / KPI</span>
          <div className="hidden items-center gap-4 md:flex">
            <span className="w-24 text-right">Score</span>
            <span className="w-9 text-center">Owner</span>
          </div>
        </div>

        {filtered.length === 0 && (
          <div className="px-4 py-16 text-center text-sm text-gray-400">No scorecards match your filters.</div>
        )}

        {view === "tree" && grouped.map(([department, cards]) => (
          <div key={department}>
            <p className="px-4 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{department}</p>
            {cards.map((sc) => (
              <ScorecardRow key={sc.id} scorecard={sc} expandedIds={expandedIds} forceExpanded={false} onToggle={toggle} />
            ))}
          </div>
        ))}

        {view === "list" && filtered.map((sc) => {
          const statusCfg = SCORECARD_STATUS_CONFIG[sc.status];
          const color = scoreColor(sc.score);
          return (
            <div key={sc.id} className="flex flex-col gap-2 border-b border-gray-100 px-4 py-3 last:border-b-0 hover:bg-gray-50 md:h-16 md:flex-row md:items-center md:justify-between md:py-0">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                  <BookOpen className="h-4 w-4 text-blue-600" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[15px] font-semibold text-gray-900">{sc.name}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusCfg.badgeBg} ${statusCfg.badgeText}`}>
                      {statusCfg.label}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-gray-400">
                    {sc.department} · {sc.period} · {sc.ownerName}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 pl-[48px] md:pl-0 md:shrink-0">
                <div className="flex items-center gap-2 md:w-24 md:justify-end">
                  <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-gray-100 md:w-14">
                    <div className={`h-full rounded-full ${color.bar}`} style={{ width: `${sc.score}%` }} />
                  </div>
                  <span className={`shrink-0 text-right text-sm font-semibold ${color.text}`}>{sc.score}%</span>
                </div>
                <div className="hidden w-9 shrink-0 md:block" aria-hidden="true" />
              </div>
            </div>
          );
        })}
      </div>

      {modalOpen && <NewScorecardModal onClose={() => setModalOpen(false)} onAdd={handleAdd} />}
    </div>
  );
}
