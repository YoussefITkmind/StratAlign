"use client";

import { useMemo } from "react";
import { ArrowRight, Map as MapIcon } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useI18n } from "@/lib/i18n/locale-context";

interface PublishedMapLink {
  id: string;
  fromObjectiveId: string;
  toObjectiveId: string;
  strength: "weak" | "strong";
}

interface PublishedMap {
  id: string;
  state: "draft" | "published";
  links: PublishedMapLink[];
}

/**
 * Presentational, read-only rendering of a scorecard's published StrategyMap
 * (scorecard.strategy_maps / scorecard.map_links — Phase 3.1) — used by the
 * Master Scorecard grid/map toggle. Renders each linked objective as a card
 * with arrows to what it drives, resolving names via the real Strategy
 * module. There is no merged interactive canvas (lanes/drag/connect) yet —
 * that ships separately under STRAAL-75 — so this stays deliberately simple
 * rather than faking a richer visual with mock data.
 */
export default function ReadOnlyMapView({ map, planVersionId }: { map: PublishedMap; planVersionId: string }) {
  const { t, locale } = useI18n();
  const nodes = trpc.strategy.nodes.useQuery();

  const nodeById = useMemo(() => {
    const byId = new Map<string, { nameEn: string; nameAr: string }>();
    for (const node of nodes.data ?? []) {
      if (node.planVersionId === planVersionId) byId.set(node.id, { nameEn: node.nameEn, nameAr: node.nameAr });
    }
    return byId;
  }, [nodes.data, planVersionId]);

  const nodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const link of map.links) {
      ids.add(link.fromObjectiveId);
      ids.add(link.toObjectiveId);
    }
    return [...ids];
  }, [map.links]);

  const nameFor = (objectiveId: string) => {
    const node = nodeById.get(objectiveId);
    if (!node) return objectiveId;
    return locale === "ar" ? node.nameAr : node.nameEn;
  };

  return (
    <div data-testid="scorecard-map-view" className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <MapIcon className="h-4 w-4 text-gray-400" />
        <p className="text-sm font-semibold text-gray-900">
          {t("scorecard.mapView")} · {map.links.length} {t("scorecard.mapLinks")}
        </p>
      </div>

      {nodes.error && <p role="alert" className="mb-3 text-sm text-red-600">{nodes.error.message}</p>}

      {nodeIds.length === 0 ? (
        <p className="text-sm text-gray-400">{t("scorecard.noMapLinked")}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {nodeIds.map((objectiveId) => {
            const outgoing = map.links.filter((link) => link.fromObjectiveId === objectiveId);
            return (
              <article key={objectiveId} data-testid="scorecard-map-node" className="rounded-xl border border-gray-100 p-4">
                <h3 className="truncate text-sm font-semibold text-gray-800">{nameFor(objectiveId)}</h3>
                <div className="mt-2 space-y-1.5">
                  {outgoing.map((link) => (
                    <div key={link.id} data-testid="scorecard-map-edge" className="flex items-center gap-1.5 text-xs text-gray-500">
                      <ArrowRight className="h-3 w-3 shrink-0 rtl:rotate-180" />
                      <span className="truncate">{nameFor(link.toObjectiveId)}</span>
                      <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">{link.strength}</span>
                    </div>
                  ))}
                  {outgoing.length === 0 && <p className="text-xs text-gray-300">—</p>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
