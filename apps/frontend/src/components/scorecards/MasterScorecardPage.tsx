"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, LayoutGrid, Map as MapIcon, TrendingUp, TrendingDown, Minus, Presentation, Download } from "lucide-react";
import { initialScorecards } from "@/data/mockScorecardData";
import { initialMaps } from "@/data/mockMapData";
import { SCORECARD_STATUS_CONFIG, PERSPECTIVE_CONFIG, scoreColor } from "@/lib/scorecardConfig";
import { useI18n } from "@/lib/i18n/locale-context";
import ReadOnlyMapView from "@/components/strategy-map/ReadOnlyMapView";

type ViewMode = "grid" | "map";

function trendOf(current: number, prior?: number): number | null {
  if (prior === undefined) return null;
  return Math.round((current - prior) * 10) / 10;
}

function TrendBadge({ delta, testId }: { delta: number | null; testId: string }) {
  const { t } = useI18n();
  if (delta === null) return null;

  if (delta === 0) {
    return (
      <span data-testid={testId} className="inline-flex items-center gap-1 text-xs font-medium text-gray-500">
        <Minus className="h-3 w-3" /> {t("scorecard.trendFlat")}
      </span>
    );
  }

  const up = delta > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span data-testid={testId} className={`inline-flex items-center gap-1 text-xs font-medium ${up ? "text-emerald-600" : "text-red-600"}`}>
      <Icon className="h-3 w-3" />
      {up ? "+" : ""}
      {delta}
    </span>
  );
}

export default function MasterScorecardPage({ scorecardId }: { scorecardId: string }) {
  const { t } = useI18n();
  const [view, setView] = useState<ViewMode>("grid");

  const scorecard = useMemo(() => initialScorecards.find((s) => s.id === scorecardId), [scorecardId]);
  const map = useMemo(
    () => (scorecard?.mapId ? initialMaps.find((m) => m.id === scorecard.mapId) : undefined),
    [scorecard]
  );

  if (!scorecard) {
    return (
      <div data-testid="master-scorecard-not-found" className="mx-auto max-w-[720px] p-6 text-center">
        <h1 className="text-lg font-semibold text-gray-900">{t("scorecard.notFoundTitle")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("scorecard.notFoundBody")}</p>
        <Link
          href="/balanced-scorecards"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {t("scorecard.backToList")}
        </Link>
      </div>
    );
  }

  const statusCfg = SCORECARD_STATUS_CONFIG[scorecard.status];
  const overallColor = scoreColor(scorecard.score);
  const counts = scorecard.perspectives.flatMap((p) => p.kpis).reduce(
    (acc, k) => {
      if (k.status === "on-track") acc.onTrack += 1;
      else if (k.status === "at-risk") acc.atRisk += 1;
      else acc.draft += 1;
      return acc;
    },
    { onTrack: 0, atRisk: 0, draft: 0 }
  );

  return (
    <div data-testid="master-scorecard-page" className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <Link
        href="/balanced-scorecards"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {t("scorecard.backToList")}
      </Link>

      {/* header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-bold text-gray-900">{scorecard.name}</h1>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusCfg.badgeBg} ${statusCfg.badgeText}`}>
              {statusCfg.label}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-gray-500">
            {scorecard.department} · {scorecard.period} · {scorecard.ownerName}
          </p>
        </div>

        {/* Presentation mode and pack export are real Phase 7 features — left visibly
            present but genuinely inert here rather than faked, per ticket scope. */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled
            title={t("scorecard.comingSoonHint")}
            data-testid="presentation-mode-button"
            className="flex items-center gap-1.5 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-400"
          >
            <Presentation className="h-4 w-4" /> {t("scorecard.presentationMode")}
          </button>
          <button
            type="button"
            disabled
            title={t("scorecard.comingSoonHint")}
            data-testid="export-pack-button"
            className="flex items-center gap-1.5 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-400"
          >
            <Download className="h-4 w-4" /> {t("scorecard.exportPack")}
          </button>
        </div>
      </div>

      {/* summary band */}
      <div data-testid="summary-band" className="mb-6 grid grid-cols-1 gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{t("scorecard.overallScore")}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span data-testid="overall-score" className={`text-3xl font-bold ${overallColor.text}`}>
              {scorecard.score}%
            </span>
            <TrendBadge delta={trendOf(scorecard.score, scorecard.priorScore)} testId="overall-trend" />
          </div>
          <p className="mt-0.5 text-xs text-gray-400">{t("scorecard.trendVsPrior")}</p>
        </div>

        <div data-testid="status-counts" className="flex items-center gap-5">
          <div>
            <p className="text-lg font-semibold text-emerald-600">{counts.onTrack}</p>
            <p className="text-xs text-gray-400">{t("scorecard.statusOnTrack")}</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-amber-600">{counts.atRisk}</p>
            <p className="text-xs text-gray-400">{t("scorecard.statusAtRisk")}</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-500">{counts.draft}</p>
            <p className="text-xs text-gray-400">{t("scorecard.statusDraft")}</p>
          </div>
        </div>

        <div className="flex items-center justify-start sm:justify-end">
          <div className="flex items-center rounded-full border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => setView("grid")}
              data-testid="view-toggle-grid"
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${view === "grid" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> {t("scorecard.gridView")}
            </button>
            <button
              type="button"
              onClick={() => setView("map")}
              data-testid="view-toggle-map"
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${view === "map" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
            >
              <MapIcon className="h-3.5 w-3.5" /> {t("scorecard.mapView")}
            </button>
          </div>
        </div>
      </div>

      {view === "map" ? (
        map ? (
          <ReadOnlyMapView map={map} />
        ) : (
          <div
            data-testid="map-empty-state"
            className="flex h-[40vh] min-h-[280px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-center"
          >
            <p className="max-w-sm text-sm text-gray-500">{t("scorecard.noMapLinked")}</p>
          </div>
        )
      ) : (
        <div data-testid="perspective-columns" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {scorecard.perspectives.map((perspective) => {
            const cfg = PERSPECTIVE_CONFIG[perspective.key];
            const Icon = cfg.icon;
            return (
              <div
                key={perspective.id}
                data-testid={`perspective-column-${perspective.key}`}
                className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}>
                      <Icon className={`h-4 w-4 ${cfg.text}`} />
                    </span>
                    <span className="truncate text-sm font-semibold text-gray-800">{cfg.label}</span>
                  </div>
                  <span data-testid={`perspective-weight-${perspective.key}`} className="shrink-0 text-xs text-gray-400">
                    {perspective.weight}% {t("scorecard.weight")}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${perspective.score}%` }} />
                  </div>
                  <span className={`shrink-0 text-sm font-semibold ${cfg.text}`}>{perspective.score}%</span>
                  <TrendBadge delta={trendOf(perspective.score, perspective.priorScore)} testId={`perspective-trend-${perspective.key}`} />
                </div>

                <div className="flex flex-col gap-2">
                  {perspective.kpis.length === 0 && <p className="text-xs text-gray-400">{t("scorecard.noObjectives")}</p>}
                  {perspective.kpis.map((kpi) => {
                    const kpiColor = scoreColor(kpi.score);
                    const kpiStatusCfg = SCORECARD_STATUS_CONFIG[kpi.status];
                    return (
                      <div key={kpi.id} data-testid={`objective-card-${kpi.id}`} data-status={kpi.status} className="rounded-xl border border-gray-100 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-[13px] font-medium text-gray-800">{kpi.name}</p>
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${kpiStatusCfg.badgeBg} ${kpiStatusCfg.badgeText}`}>
                            {kpiStatusCfg.label}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <div data-testid={`objective-bar-${kpi.id}`} className={`h-full rounded-full ${kpiColor.bar}`} style={{ width: `${kpi.score}%` }} />
                          </div>
                          <span className={`shrink-0 text-xs font-semibold ${kpiColor.text}`}>{kpi.score}%</span>
                        </div>
                        <div className="mt-1">
                          <TrendBadge delta={trendOf(kpi.score, kpi.priorScore)} testId={`objective-trend-${kpi.id}`} />
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
    </div>
  );
}
