"use client";

import type { StrategyMap } from "@/types/strategyMap";
import { useI18n } from "@/lib/i18n/locale-context";
import MapThumbnail from "@/components/strategy-map/MapThumbnail";
import { WidgetCard } from "./WidgetCard";

export function MapThumbnailWidget({ map }: { map: StrategyMap | undefined }) {
  const { t } = useI18n();

  return (
    <WidgetCard
      testId="widget-map-thumbnail"
      title={t("home.mapThumbnailTitle")}
      subtitle={map?.name}
      href={map ? `/strategy-maps/${map.id}` : undefined}
      linkLabel={t("home.openMap")}
    >
      {map ? (
        <MapThumbnail map={map} />
      ) : (
        <p className="text-xs text-gray-400">{t("home.noMapLinked")}</p>
      )}
    </WidgetCard>
  );
}
