"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronDown, ChevronRight, LayoutGrid, Map as MapIcon, Layers, Presentation, Download, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useI18n } from "@/lib/i18n/locale-context";
import { usePublishAssistantContext } from "@/lib/assistant/assistant-context";
import { RAG_STATUS_ORDER, RAG_STATUS_TOKENS, ragStatusTokens, worstRagStatus, type RagStatus } from "@/lib/theme/ragStatus";
import ReadOnlyMapView from "@/components/strategy-map/ReadOnlyMapView";
import NewScorecardModal from "./NewScorecardModal";
import { initialScorecards } from "@/data/mockScorecardData";
import { PERSPECTIVE_CONFIG, KPI_STATUS_DOT, scoreColor } from "@/lib/scorecardConfig";
import type { Scorecard as MockScorecard, ScorecardStatus as MockKpiStatus, PerspectiveKey } from "@/types/scorecard";

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return <div className="h-6 w-16" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * 100},${26 - ((v - min) / range) * 22}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 26" preserveAspectRatio="none" className="h-6 w-16 shrink-0 text-sky-500">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function varianceTone(variance?: string) {
  const v = variance?.trim();
  if (!v || v === "—") return { bg: "bg-gray-100", text: "text-gray-500" };
  if (v.startsWith("-")) return { bg: "bg-red-50", text: "text-red-600" };
  if (v.startsWith("+")) return { bg: "bg-emerald-50", text: "text-emerald-600" };
  return { bg: "bg-gray-100", text: "text-gray-600" };
}

type ViewMode = "grid" | "map";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY_PLACEMENTS: PlacementDetail[] = [];

const PERSPECTIVE_PALETTE = [
  { bg: "bg-emerald-50", text: "text-emerald-600" },
  { bg: "bg-blue-50", text: "text-blue-600" },
  { bg: "bg-violet-50", text: "text-violet-600" },
  { bg: "bg-amber-50", text: "text-amber-600" },
  { bg: "bg-cyan-50", text: "text-cyan-600" },
];

interface ScorecardPerspective {
  id: string;
  scorecardId: string;
  nameEn: string;
  nameAr: string;
  order: number;
}

interface ScorecardWeighting {
  id: string;
  scorecardId: string;
  perspectiveWeights: Record<string, number>;
  scoringFormulaId: string;
  activeFrom: string;
}

interface PublishedMapLink {
  id: string;
  strategyMapId: string;
  fromObjectiveId: string;
  toObjectiveId: string;
  strength: "weak" | "strong";
}

interface PublishedMap {
  id: string;
  scorecardId: string;
  state: "draft" | "published";
  links: PublishedMapLink[];
}

interface ScorecardDetail {
  id: string;
  nameEn: string;
  nameAr: string;
  planVersionId: string;
  perspectives: ScorecardPerspective[];
  weighting: ScorecardWeighting | null;
  publishedMap: PublishedMap | null;
}

interface PlacementDetail {
  perspectiveId: string;
  objectiveNodeId: string;
  objectiveNameEn: string;
  objectiveNameAr: string;
  kpiDefinitionId: string | null;
  kpiNameEn: string | null;
  status: RagStatus | null;
}

interface WeightingPreview {
  currentScore: number | null;
  perspectiveStatuses: Array<{ perspectiveId: string; status: RagStatus }>;
}

function mockStatusToRag(status: MockKpiStatus): RagStatus | null {
  if (status === "on-track") return "on_track";
  if (status === "at-risk") return "watch";
  return null;
}

/**
 * The scorecard list at /balanced-scorecards is still demo data (not yet
 * wired to the real backend), so its rows carry non-UUID ids. Rather than
 * dead-ending those clicks in "not found", adapt the same demo scorecard
 * into the shape this page already renders from the real backend — lets the
 * built UI be previewed with no backend/DB required.
 */
function adaptMockScorecard(mock: MockScorecard): { scorecard: ScorecardDetail; placements: PlacementDetail[]; preview: WeightingPreview } {
  const perspectives: ScorecardPerspective[] = mock.perspectives.map((p, index) => ({
    id: p.id,
    scorecardId: mock.id,
    nameEn: PERSPECTIVE_CONFIG[p.key].label,
    nameAr: PERSPECTIVE_CONFIG[p.key].label,
    order: index,
  }));

  const placements: PlacementDetail[] = mock.perspectives.flatMap((p) =>
    p.kpis.map((kpi) => ({
      perspectiveId: p.id,
      objectiveNodeId: kpi.id,
      objectiveNameEn: kpi.name,
      objectiveNameAr: kpi.name,
      kpiDefinitionId: kpi.id,
      kpiNameEn: kpi.name,
      status: mockStatusToRag(kpi.status),
    }))
  );

  const preview: WeightingPreview = {
    currentScore: mock.score,
    perspectiveStatuses: mock.perspectives.map((p) => ({
      perspectiveId: p.id,
      status: worstRagStatus(p.kpis.map((kpi) => mockStatusToRag(kpi.status))) ?? "on_track",
    })),
  };

  const scorecard: ScorecardDetail = {
    id: mock.id,
    nameEn: mock.name,
    nameAr: mock.name,
    planVersionId: "",
    perspectives,
    weighting: {
      id: `${mock.id}-weighting`,
      scorecardId: mock.id,
      perspectiveWeights: Object.fromEntries(mock.perspectives.map((p) => [p.id, p.weight])),
      scoringFormulaId: "",
      activeFrom: "",
    },
    publishedMap: null,
  };

  return { scorecard, placements, preview };
}

export default function MasterScorecardPage({ scorecardId }: { scorecardId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("grid");
  const [newScorecardOpen, setNewScorecardOpen] = useState(false);
  const isUuid = UUID_PATTERN.test(scorecardId);

  const mockSource = useMemo(() => (isUuid ? undefined : initialScorecards.find((sc) => sc.id === scorecardId)), [isUuid, scorecardId]);
  const mockAdapted = useMemo(() => (mockSource ? adaptMockScorecard(mockSource) : undefined), [mockSource]);
  const mockPerspectives = useMemo(() => mockSource?.perspectives ?? [], [mockSource]);
  const mockKpiCount = useMemo(() => mockPerspectives.reduce((sum, p) => sum + p.kpis.length, 0), [mockPerspectives]);

  const [activePerspectiveKey, setActivePerspectiveKey] = useState<PerspectiveKey | "all">("all");
  const [expandedPerspectiveIds, setExpandedPerspectiveIds] = useState<Set<string>>(
    () => new Set(mockSource?.perspectives[0] ? [mockSource.perspectives[0].id] : [])
  );
  const togglePerspective = (id: string) =>
    setExpandedPerspectiveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportScorecard = () => {
    if (!mockSource) return;
    const blob = new Blob([JSON.stringify(mockSource, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${mockSource.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const scorecardQuery = trpc.scorecard.get.useQuery({ scorecardId }, { enabled: isUuid });
  const placementsQuery = trpc.scorecard.placement.list.useQuery({ scorecardId }, { enabled: isUuid });
  const scorecard = isUuid ? (scorecardQuery.data as ScorecardDetail | undefined) : mockAdapted?.scorecard;
  const activeWeights = scorecard?.weighting?.perspectiveWeights;
  const previewQuery = trpc.scorecard.weighting.preview.useQuery(
    { scorecardId, draftWeights: activeWeights ?? {} },
    { enabled: isUuid && Boolean(activeWeights) }
  );
  const preview = isUuid ? (previewQuery.data as WeightingPreview | undefined) : mockAdapted?.preview;
  const placements = isUuid ? ((placementsQuery.data as PlacementDetail[] | undefined) ?? EMPTY_PLACEMENTS) : (mockAdapted?.placements ?? EMPTY_PLACEMENTS);

  const placementsByPerspective = useMemo(() => {
    const map = new Map<string, PlacementDetail[]>();
    for (const placement of placements) {
      const list = map.get(placement.perspectiveId) ?? [];
      list.push(placement);
      map.set(placement.perspectiveId, list);
    }
    return map;
  }, [placements]);

  const perspectiveStatusById = useMemo(() => {
    const map = new Map<string, RagStatus>();
    for (const row of preview?.perspectiveStatuses ?? []) map.set(row.perspectiveId, row.status);
    return map;
  }, [preview]);

  const overallStatus = worstRagStatus([...perspectiveStatusById.values()]);
  const statusCounts = useMemo(() => {
    const counts: Record<RagStatus, number> = { on_track: 0, watch: 0, off_track: 0 };
    for (const placement of placements) {
      if (placement.status) counts[placement.status] += 1;
    }
    return counts;
  }, [placements]);

  // Only real backend data grounds the assistant — the demo-fixture path
  // (mockAdapted) must never be presented to it as genuine business data.
  const assistantEntity = useMemo(
    () => (isUuid && scorecard ? { type: "scorecard", id: scorecardId, name: scorecard.nameEn } : null),
    [isUuid, scorecard, scorecardId],
  );
  const assistantData = useMemo(() => {
    if (!isUuid || !scorecard) return null;
    return {
      overallStatus: overallStatus ?? null,
      onTrack: statusCounts.on_track,
      watch: statusCounts.watch,
      offTrack: statusCounts.off_track,
      perspectives: scorecard.perspectives.map((perspective) => ({
        name: perspective.nameEn,
        status: perspectiveStatusById.get(perspective.id) ?? null,
      })),
      kpis: placements.slice(0, 30).map((placement) => ({
        objective: placement.objectiveNameEn,
        kpi: placement.kpiNameEn,
        status: placement.status,
      })),
    };
  }, [isUuid, scorecard, overallStatus, statusCounts, perspectiveStatusById, placements]);
  usePublishAssistantContext("balanced_scorecards", assistantEntity, assistantData);

  if (!isUuid && !mockSource) {
    return (
      <div data-testid="master-scorecard-not-found" className="mx-auto max-w-[720px] p-6 text-center">
        <h1 className="text-lg font-semibold text-gray-900">{t("scorecard.notFoundTitle")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("scorecard.notFoundBody")}</p>
        <Link href="/balanced-scorecards" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700">
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {t("scorecard.backToList")}
        </Link>
      </div>
    );
  }

  if (isUuid && scorecardQuery.isLoading) {
    return <p className="p-8 text-sm text-gray-500">{t("common.loading")}</p>;
  }

  if (isUuid && scorecardQuery.error) {
    return (
      <div className="p-8">
        <p role="alert" className="text-sm text-red-600">{scorecardQuery.error.message}</p>
        <Link href="/balanced-scorecards" className="mt-3 inline-flex items-center gap-1.5 text-sm text-blue-600">
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {t("scorecard.backToList")}
        </Link>
      </div>
    );
  }

  if (!scorecard) {
    return (
      <div data-testid="master-scorecard-not-found" className="mx-auto max-w-[720px] p-6 text-center">
        <h1 className="text-lg font-semibold text-gray-900">{t("scorecard.notFoundTitle")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("scorecard.notFoundBody")}</p>
        <Link href="/balanced-scorecards" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700">
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {t("scorecard.backToList")}
        </Link>
      </div>
    );
  }

  const overallTokens = overallStatus ? RAG_STATUS_TOKENS[overallStatus] : null;
  const perspectives = [...scorecard.perspectives].sort((a, b) => a.order - b.order);

  return (
    <div data-testid="master-scorecard-page" className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <Link href="/balanced-scorecards" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700">
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {t("scorecard.backToList")}
      </Link>

      {/* header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-bold text-gray-900">{locale === "ar" ? scorecard.nameAr : scorecard.nameEn}</h1>
            {overallTokens && (
              <span data-testid="scorecard-status-badge" className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${overallTokens.badgeBg} ${overallTokens.badgeText}`}>
                {overallTokens.label}
              </span>
            )}
            {!isUuid && (
              <span data-testid="demo-data-badge" title="This scorecard isn't wired to the backend yet — showing local demo data" className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                {locale === "ar" ? "بيانات تجريبية" : "Demo data"}
              </span>
            )}
          </div>
          {!isUuid && mockSource && (
            <p className="mt-0.5 text-sm text-gray-500">
              {mockKpiCount} KPIs &middot; {mockSource.period} &middot; Owner: {mockSource.ownerName}
            </p>
          )}
        </div>

        {isUuid ? (
          // Presentation mode and pack export are real Phase 7 features — left visibly
          // present but genuinely inert here rather than faked, per ticket scope.
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled title={t("scorecard.comingSoonHint")} data-testid="presentation-mode-button"
              className="flex items-center gap-1.5 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-400">
              <Presentation className="h-4 w-4" /> {t("scorecard.presentationMode")}
            </button>
            <button type="button" disabled title={t("scorecard.comingSoonHint")} data-testid="export-pack-button"
              className="flex items-center gap-1.5 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-400">
              <Download className="h-4 w-4" /> {t("scorecard.exportPack")}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={exportScorecard} data-testid="demo-export-button"
              className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Download className="h-4 w-4" /> Export
            </button>
            <button type="button" onClick={() => setNewScorecardOpen(true)} data-testid="demo-new-scorecard-button"
              className="flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              <Plus className="h-4 w-4" /> New Scorecard
            </button>
          </div>
        )}
      </div>

      {newScorecardOpen && (
        <NewScorecardModal
          onClose={() => setNewScorecardOpen(false)}
          onAdd={() => router.push("/balanced-scorecards")}
        />
      )}

      {!isUuid && mockSource ? (
        <>
          {/* perspective filter tabs + status legend */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActivePerspectiveKey("all")}
                className={`rounded-full px-4 py-2 text-sm font-medium ${activePerspectiveKey === "all" ? "bg-slate-900 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
              >
                All Perspectives
              </button>
              {mockPerspectives.map((p) => {
                const cfg = PERSPECTIVE_CONFIG[p.key];
                const Icon = cfg.icon;
                const active = activePerspectiveKey === p.key;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActivePerspectiveKey(p.key)}
                    className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium ${active ? "bg-slate-900 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                  >
                    <Icon className="h-3.5 w-3.5" /> {cfg.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> On Track</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> At Risk</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> Behind</span>
            </div>
          </div>

          {/* perspective summary cards */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {mockPerspectives.map((p) => {
              const cfg = PERSPECTIVE_CONFIG[p.key];
              const Icon = cfg.icon;
              const onTrack = p.kpis.filter((k) => k.status === "on-track").length;
              return (
                <div key={p.id} data-testid={`perspective-summary-${p.id}`} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}>
                      <Icon className={`h-4 w-4 ${cfg.text}`} />
                    </span>
                    <span className="truncate text-sm font-semibold text-gray-800">{cfg.label}</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className={`text-3xl font-bold ${cfg.text}`}>{p.score}%</span>
                    <span className="shrink-0 text-xs text-gray-400">{onTrack}/{p.kpis.length} KPIs</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${Math.min(100, Math.max(0, p.score))}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-gray-400">Weight: {p.weight}%</p>
                </div>
              );
            })}
          </div>

          {/* per-perspective detail: expandable KPI table */}
          <div className="space-y-4">
            {mockPerspectives
              .filter((p) => activePerspectiveKey === "all" || activePerspectiveKey === p.key)
              .map((p) => {
                const cfg = PERSPECTIVE_CONFIG[p.key];
                const Icon = cfg.icon;
                const expanded = expandedPerspectiveIds.has(p.id);
                const onTrack = p.kpis.filter((k) => k.status === "on-track").length;
                const behind = p.kpis.length - onTrack;
                return (
                  <div key={p.id} data-testid={`perspective-detail-${p.id}`} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <button
                      type="button"
                      onClick={() => togglePerspective(p.id)}
                      className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}>
                          <Icon className={`h-4 w-4 ${cfg.text}`} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold text-gray-900">{cfg.label}</p>
                          <p className="truncate text-xs text-gray-400">
                            Weight: {p.weight}% &middot; Score: <span className={`font-medium ${cfg.text}`}>{p.score}%</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {p.kpis.length > 0 && (
                          <div className="hidden items-center gap-3 text-xs sm:flex">
                            <span className="font-medium text-emerald-600">{onTrack} on track</span>
                            {behind > 0 && <span className="font-medium text-red-600">{behind} behind</span>}
                          </div>
                        )}
                        <div className="hidden w-24 items-center gap-2 md:flex">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                            <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${Math.min(100, Math.max(0, p.score))}%` }} />
                          </div>
                          <span className={`text-sm font-semibold ${cfg.text}`}>{p.score}%</span>
                        </div>
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${p.owner.color}`}>
                          {p.owner.initials}
                        </span>
                        {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
                      </div>
                    </button>

                    {expanded && (
                      p.kpis.length === 0 ? (
                        <p className="border-t border-gray-100 px-5 py-6 text-center text-sm text-gray-400">{t("scorecard.noObjectives")}</p>
                      ) : (
                        <div className="overflow-x-auto border-t border-gray-100">
                          <table className="w-full min-w-[840px] text-sm">
                            <thead>
                              <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                <th className="w-8 py-2 pl-5"></th>
                                <th className="py-2 pr-3">KPI Name</th>
                                <th className="py-2 pr-3 text-right">Weight</th>
                                <th className="py-2 pr-3 text-right">Actual</th>
                                <th className="py-2 pr-3 text-right">Target</th>
                                <th className="py-2 pr-3 text-right">Variance</th>
                                <th className="py-2 pr-3">Progress</th>
                                <th className="py-2 pr-3">Trend</th>
                                <th className="py-2 pr-5 text-right">Owner</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.kpis.map((kpi) => {
                                const tone = varianceTone(kpi.variance);
                                return (
                                  <tr key={kpi.id} data-testid={`demo-kpi-row-${kpi.id}`} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50">
                                    <td className="py-3 pl-5">
                                      <span className={`block h-2 w-2 rounded-full ${KPI_STATUS_DOT[kpi.status]}`} />
                                    </td>
                                    <td className="py-3 pr-3 font-medium text-gray-800">{kpi.name}</td>
                                    <td className="py-3 pr-3 text-right text-gray-500">{kpi.weight != null ? `${kpi.weight}%` : "—"}</td>
                                    <td className="py-3 pr-3 text-right font-medium text-gray-800">{kpi.actual ?? "—"}</td>
                                    <td className="py-3 pr-3 text-right text-gray-500">{kpi.target ?? "—"}</td>
                                    <td className="py-3 pr-3 text-right">
                                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone.bg} ${tone.text}`}>{kpi.variance ?? "—"}</span>
                                    </td>
                                    <td className="py-3 pr-3">
                                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
                                        <div className={`h-full rounded-full ${scoreColor(kpi.score).bar}`} style={{ width: `${Math.min(100, Math.max(0, kpi.score))}%` }} />
                                      </div>
                                    </td>
                                    <td className="py-3 pr-3">
                                      <Sparkline data={kpi.trend ?? []} />
                                    </td>
                                    <td className="py-3 pr-5 text-right">
                                      <span className={`ml-auto flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ${kpi.owner.color}`}>
                                        {kpi.owner.initials}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}
                  </div>
                );
              })}
          </div>
        </>
      ) : (
        <>
      {/* summary band */}
      <div data-testid="summary-band" className="mb-6 grid grid-cols-1 gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{t("scorecard.overallScore")}</p>
          {preview?.currentScore != null ? (
            <div className="mt-1 flex items-baseline gap-2">
              <span data-testid="overall-score" className={`text-3xl font-bold ${overallTokens?.text ?? "text-gray-900"}`}>
                {Math.round(preview.currentScore)}%
              </span>
            </div>
          ) : (
            <p data-testid="overall-score-unavailable" className="mt-1 text-sm text-gray-400">
              {previewQuery.error ? previewQuery.error.message : t("scorecard.noWeightingYet")}
            </p>
          )}
        </div>

        <div data-testid="status-counts" className="flex items-center gap-5">
          {RAG_STATUS_ORDER.map((status) => (
            <div key={status}>
              <p className={`text-lg font-semibold ${RAG_STATUS_TOKENS[status].text}`}>{statusCounts[status]}</p>
              <p className="text-xs text-gray-400">{RAG_STATUS_TOKENS[status].label}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-start sm:justify-end">
          <div className="flex items-center rounded-full border border-gray-200 bg-gray-50 p-1">
            <button type="button" onClick={() => setView("grid")} data-testid="view-toggle-grid"
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${view === "grid" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
              <LayoutGrid className="h-3.5 w-3.5" /> {t("scorecard.gridView")}
            </button>
            <button type="button" onClick={() => setView("map")} data-testid="view-toggle-map"
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${view === "map" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
              <MapIcon className="h-3.5 w-3.5" /> {t("scorecard.mapView")}
            </button>
          </div>
        </div>
      </div>

      {view === "map" ? (
        scorecard.publishedMap ? (
          <ReadOnlyMapView perspectives={scorecard.perspectives} placements={placements} links={scorecard.publishedMap.links} />
        ) : (
          <div data-testid="map-empty-state" className="flex h-[40vh] min-h-[280px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-center">
            <p className="max-w-sm text-sm text-gray-500">{t("scorecard.noMapLinked")}</p>
          </div>
        )
      ) : (
        <div data-testid="perspective-columns" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {perspectives.map((perspective, index) => {
            const palette = PERSPECTIVE_PALETTE[index % PERSPECTIVE_PALETTE.length];
            const weight = scorecard.weighting?.perspectiveWeights[perspective.id];
            const status = perspectiveStatusById.get(perspective.id) ?? null;
            const statusTokens = ragStatusTokens(status);
            const kpis = placementsByPerspective.get(perspective.id) ?? [];
            return (
              <div key={perspective.id} data-testid={`perspective-column-${perspective.id}`}
                className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${palette.bg}`}>
                      <Layers className={`h-4 w-4 ${palette.text}`} />
                    </span>
                    <span className="truncate text-sm font-semibold text-gray-800">{locale === "ar" ? perspective.nameAr : perspective.nameEn}</span>
                  </div>
                  {weight != null && (
                    <span data-testid={`perspective-weight-${perspective.id}`} className="shrink-0 text-xs text-gray-400">
                      {weight}% {t("scorecard.weight")}
                    </span>
                  )}
                </div>

                {status && (
                  <span data-testid={`perspective-status-${perspective.id}`} className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTokens.badgeBg} ${statusTokens.badgeText}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${statusTokens.dot}`} /> {statusTokens.label}
                  </span>
                )}

                <div className="flex flex-col gap-2">
                  {kpis.length === 0 && <p className="text-xs text-gray-400">{t("scorecard.noObjectives")}</p>}
                  {kpis.map((kpi) => {
                    const kpiTokens = ragStatusTokens(kpi.status);
                    return (
                      <div key={kpi.objectiveNodeId} data-testid={`objective-card-${kpi.objectiveNodeId}`} data-status={kpi.status ?? ""}
                        className="rounded-xl border border-gray-100 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium text-gray-800">{locale === "ar" ? kpi.objectiveNameAr : kpi.objectiveNameEn}</p>
                            {kpi.kpiNameEn && <p className="truncate text-[11px] text-gray-400">{kpi.kpiNameEn}</p>}
                          </div>
                          <span data-testid={`objective-status-${kpi.objectiveNodeId}`} className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${kpiTokens.badgeBg} ${kpiTokens.badgeText}`}>
                            {kpiTokens.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}
    </div>
  );
}
