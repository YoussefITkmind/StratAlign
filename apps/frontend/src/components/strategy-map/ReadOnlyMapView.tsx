"use client";

import { useMemo, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n/locale-context";
import StrategyMapFlowCanvas from "./StrategyMapFlowCanvas";
import MapLinks from "./MapLinks";
import type { MapPerspective, MapPlacement, MapLinkRow } from "@/lib/buildStrategyMapFlow";

/**
 * Presentational, read-only rendering of a scorecard's published StrategyMap
 * — used by the Master Scorecard grid/map toggle. Shares the same
 * perspective-lane/objective-node canvas as the editable Strategy Map Canvas
 * (StrategyMapFlowCanvas), fed with the perspectives/placements the caller
 * already fetched, just without edit affordances.
 */
export default function ReadOnlyMapView({
  perspectives,
  placements,
  links,
}: {
  perspectives: MapPerspective[];
  placements: MapPlacement[];
  links: MapLinkRow[];
}) {
  const { t } = useI18n();
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string | null>(null);
  const objectiveNames = useMemo(() => new Map(placements.map((item) => [item.objectiveNodeId, item.objectiveNameEn])), [placements]);

  return (
    <div data-testid="scorecard-map-view" className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <MapIcon className="h-4 w-4 text-gray-400" />
        <p className="text-sm font-semibold text-gray-900">
          {t("scorecard.mapView")} · {links.length} {t("scorecard.mapLinks")}
        </p>
      </div>

      {links.length === 0 ? (
        <p className="text-sm text-gray-400">{t("scorecard.noMapLinked")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <StrategyMapFlowCanvas
            perspectives={perspectives}
            placements={placements}
            links={links}
            editing={false}
            selectedObjectiveId={selectedObjectiveId}
            onSelectObjective={setSelectedObjectiveId}
          />
          <MapLinks links={links} objectiveName={(id) => objectiveNames.get(id) ?? id} editable={false} />
        </div>
      )}
    </div>
  );
}
