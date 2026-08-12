"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { useI18n } from "@/lib/i18n/locale-context";
import { WidgetCard } from "./WidgetCard";

interface ScorecardRow { id: string; nameEn: string; nameAr: string }
interface ScorecardDetail { weighting: { perspectiveWeights: Record<string, number> } | null }
interface WeightingPreview { currentScore: number | null }

const STATUS_TOKENS = {
  good: { bg: "bg-emerald-50", text: "text-emerald-600" },
  warn: { bg: "bg-amber-50", text: "text-amber-600" },
  bad: { bg: "bg-red-50", text: "text-red-600" },
  none: { bg: "bg-gray-100", text: "text-gray-500" },
};

/**
 * The real Prompt 3.1/3.2 summary: the same scorecard.get + weighting.preview
 * data Master Scorecard itself reads, so an approved weighting change shows
 * up here live once queries refetch — no separate Home-only computation.
 */
function ScorecardStripItem({ scorecard, locale }: { scorecard: ScorecardRow; locale: string }) {
  const detailQuery = trpc.scorecard.get.useQuery({ scorecardId: scorecard.id });
  const detail = detailQuery.data as ScorecardDetail | undefined;
  const weights = detail?.weighting?.perspectiveWeights;
  const previewQuery = trpc.scorecard.weighting.preview.useQuery(
    { scorecardId: scorecard.id, draftWeights: weights ?? {} },
    { enabled: Boolean(weights) }
  );
  const score = (previewQuery.data as WeightingPreview | undefined)?.currentScore;
  const status = score == null ? "none" : score >= 75 ? "good" : score >= 50 ? "warn" : "bad";
  const tokens = STATUS_TOKENS[status];

  return (
    <Link
      href={`/balanced-scorecards/${scorecard.id}`}
      data-testid={`scorecard-strip-item-${scorecard.id}`}
      className="flex w-[190px] shrink-0 flex-col gap-1.5 rounded-xl border border-gray-100 p-3 transition hover:border-gray-200 hover:bg-gray-50"
    >
      <p className="truncate text-[13px] font-medium text-gray-800">{locale === "ar" ? scorecard.nameAr : scorecard.nameEn}</p>
      <div className="flex items-baseline gap-2">
        <span data-testid={`scorecard-strip-score-${scorecard.id}`} className={`text-xl font-bold ${tokens.text}`}>
          {score != null ? `${Math.round(score)}%` : "—"}
        </span>
      </div>
      <span className={`w-fit rounded-full ${tokens.bg} ${tokens.text} px-2 py-0.5 text-[10px] font-medium`}>
        {score == null ? "No weighting yet" : status === "good" ? "On Track" : status === "warn" ? "Watch" : "Off Track"}
      </span>
    </Link>
  );
}

export function ScorecardStripWidget() {
  const { t, locale } = useI18n();
  const listQuery = trpc.scorecard.list.useQuery();
  const scorecards = ((listQuery.data as ScorecardRow[] | undefined) ?? []).slice(0, 4);

  return (
    <WidgetCard testId="widget-scorecard-strip" title={t("home.scorecardStripTitle")} href="/balanced-scorecards" linkLabel={t("home.viewAll")}>
      {listQuery.error && <p role="alert" className="text-xs text-red-600">{listQuery.error.message}</p>}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {scorecards.map((scorecard) => (
          <ScorecardStripItem key={scorecard.id} scorecard={scorecard} locale={locale} />
        ))}
        {scorecards.length === 0 && !listQuery.isLoading && <p className="text-xs text-gray-400">{t("home.noData")}</p>}
      </div>
    </WidgetCard>
  );
}
