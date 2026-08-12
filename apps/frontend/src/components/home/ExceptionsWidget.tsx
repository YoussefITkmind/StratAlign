"use client";

import type { Kpi } from "@/types/kpi";
import { STATUS_CONFIG, formatValue, formatVariance } from "@/lib/kpiConfig";
import { useI18n } from "@/lib/i18n/locale-context";
import { WidgetCard } from "./WidgetCard";

export function ExceptionsWidget({ kpis }: { kpis: Kpi[] }) {
  const { t } = useI18n();

  return (
    <WidgetCard
      testId="widget-exceptions"
      title={t("home.exceptionsTitle")}
      subtitle={t("home.exceptionsSubtitle").replace("{count}", String(kpis.length))}
      href="/kpis-okrs"
      linkLabel={t("home.viewAll")}
    >
      <div className="flex flex-col divide-y divide-gray-100">
        {kpis.map((kpi) => {
          const cfg = STATUS_CONFIG[kpi.status];
          return (
            <div key={kpi.id} data-testid={`exception-item-${kpi.id}`} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-gray-800">{kpi.name}</p>
                <p className="mt-0.5 truncate text-xs text-gray-400">
                  {kpi.owner.name} · {formatValue(kpi.actual, kpi.unit)} {t("home.vsTarget")} {formatValue(kpi.target, kpi.unit)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs font-medium text-gray-500">{formatVariance(kpi.actual, kpi.target, kpi.unit)}</span>
                <span className={`rounded-full ${cfg.badgeBg} ${cfg.badgeText} px-2 py-0.5 text-[11px] font-medium`}>
                  {cfg.label}
                </span>
              </div>
            </div>
          );
        })}
        {kpis.length === 0 && <p className="text-xs text-gray-400">{t("home.noExceptions")}</p>}
      </div>
    </WidgetCard>
  );
}
