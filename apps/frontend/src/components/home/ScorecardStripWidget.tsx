"use client";

import Link from "next/link";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Scorecard } from "@/types/scorecard";
import { SCORECARD_STATUS_CONFIG, scoreColor } from "@/lib/scorecardConfig";
import { useI18n } from "@/lib/i18n/locale-context";
import { WidgetCard } from "./WidgetCard";

export function ScorecardStripWidget({ scorecards }: { scorecards: Scorecard[] }) {
  const { t } = useI18n();

  return (
    <WidgetCard
      testId="widget-scorecard-strip"
      title={t("home.scorecardStripTitle")}
      href="/balanced-scorecards"
      linkLabel={t("home.viewAll")}
    >
      <div className="flex gap-3 overflow-x-auto pb-1">
        {scorecards.map((sc) => {
          const statusCfg = SCORECARD_STATUS_CONFIG[sc.status];
          const color = scoreColor(sc.score);
          const delta = sc.priorScore !== undefined ? Math.round((sc.score - sc.priorScore) * 10) / 10 : null;
          const DeltaIcon = delta === null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;

          return (
            <Link
              key={sc.id}
              href={`/balanced-scorecards/${sc.id}`}
              data-testid={`scorecard-strip-item-${sc.id}`}
              className="flex w-[190px] shrink-0 flex-col gap-1.5 rounded-xl border border-gray-100 p-3 transition hover:border-gray-200 hover:bg-gray-50"
            >
              <p className="truncate text-[13px] font-medium text-gray-800">{sc.name}</p>
              <div className="flex items-baseline gap-2">
                <span className={`text-xl font-bold ${color.text}`}>{sc.score}%</span>
                {delta !== null && (
                  <span
                    className={`flex items-center gap-0.5 text-xs font-medium ${
                      delta === 0 ? "text-gray-400" : delta > 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    <DeltaIcon className="h-3 w-3" />
                    {delta > 0 ? "+" : ""}
                    {delta}
                  </span>
                )}
              </div>
              <span className={`w-fit rounded-full ${statusCfg.badgeBg} ${statusCfg.badgeText} px-2 py-0.5 text-[10px] font-medium`}>
                {statusCfg.label}
              </span>
            </Link>
          );
        })}
      </div>
    </WidgetCard>
  );
}
