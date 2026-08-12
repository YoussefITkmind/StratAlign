"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Kpi } from "@/types/kpi";
import { STATUS_CONFIG, formatValue } from "@/lib/kpiConfig";
import { useI18n } from "@/lib/i18n/locale-context";
import { WidgetCard } from "./WidgetCard";
import { Sparkline } from "./Sparkline";

export function KpiTilesWidget({ kpis }: { kpis: Kpi[] }) {
  const { t } = useI18n();

  return (
    <WidgetCard
      testId="widget-kpi-tiles"
      title={t("home.kpiTilesTitle")}
      href="/kpis-okrs"
      linkLabel={t("home.viewAll")}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {kpis.map((kpi) => {
          const cfg = STATUS_CONFIG[kpi.status];
          const history = kpi.history.map((h) => h.value);
          const prior = history.length > 1 ? history[history.length - 2] : undefined;
          const delta = prior !== undefined ? kpi.actual - prior : null;
          const improving = delta !== null && (kpi.direction === "higher-better" ? delta > 0 : delta < 0);
          const DeltaIcon = delta === null || delta === 0 ? Minus : improving ? TrendingUp : TrendingDown;

          return (
            <div
              key={kpi.id}
              data-testid={`kpi-tile-${kpi.id}`}
              className="rounded-xl border border-gray-100 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-[13px] font-medium text-gray-800">{kpi.name}</p>
                <span className={`shrink-0 rounded-full ${cfg.badgeBg} ${cfg.badgeText} px-1.5 py-0.5 text-[10px] font-medium`}>
                  {cfg.label}
                </span>
              </div>
              <div className="mt-2 flex items-end justify-between gap-2">
                <div>
                  <p className="text-lg font-semibold text-gray-900">{formatValue(kpi.actual, kpi.unit)}</p>
                  <p
                    className={`flex items-center gap-1 text-xs font-medium ${
                      delta === null || delta === 0 ? "text-gray-400" : improving ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    <DeltaIcon className="h-3 w-3" />
                    {delta !== null ? formatValue(Math.abs(delta), kpi.unit) : "—"}
                  </p>
                </div>
                <Sparkline values={history} colorHex={cfg.hex} />
              </div>
            </div>
          );
        })}
        {kpis.length === 0 && <p className="text-xs text-gray-400">{t("home.noData")}</p>}
      </div>
    </WidgetCard>
  );
}
