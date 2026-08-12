"use client";

import { useMemo } from "react";
import { trpc } from "@/lib/trpc/client";
import { useI18n } from "@/lib/i18n/locale-context";
import { WidgetCard } from "./WidgetCard";

interface ScorecardRow { id: string; nameEn: string; nameAr: string; planVersionId: string }
interface PublishedMapLink { fromObjectiveId: string; toObjectiveId: string }
interface ScorecardDetail { nameEn: string; nameAr: string; planVersionId: string; publishedMap: { links: PublishedMapLink[] } | null }

/**
 * The real, actually-published Prompt 3.3 strategy map for the first real
 * scorecard — same scorecard.get().publishedMap Master Scorecard's map
 * toggle reads, not mock map data. A compact list rather than the full
 * ReactFlow canvas (that's what the "Open map" link is for).
 */
export function MapThumbnailWidget() {
  const { t, locale } = useI18n();
  const listQuery = trpc.scorecard.list.useQuery();
  const scorecards = (listQuery.data as ScorecardRow[] | undefined) ?? [];
  const firstId = scorecards[0]?.id;
  const detailQuery = trpc.scorecard.get.useQuery({ scorecardId: firstId ?? "" }, { enabled: Boolean(firstId) });
  const detail = detailQuery.data as ScorecardDetail | undefined;
  const links = detail?.publishedMap?.links ?? [];

  const nodesQuery = trpc.strategy.nodes.useQuery();
  const nameById = useMemo(() => {
    const map = new Map<string, { nameEn: string; nameAr: string }>();
    for (const node of nodesQuery.data ?? []) map.set(node.id, { nameEn: node.nameEn, nameAr: node.nameAr });
    return map;
  }, [nodesQuery.data]);
  const nameFor = (objectiveId: string) => {
    const node = nameById.get(objectiveId);
    return node ? (locale === "ar" ? node.nameAr : node.nameEn) : objectiveId;
  };

  return (
    <WidgetCard
      testId="widget-map-thumbnail"
      title={t("home.mapThumbnailTitle")}
      subtitle={detail ? (locale === "ar" ? detail.nameAr : detail.nameEn) : undefined}
      href={firstId ? `/strategy-maps/${firstId}` : undefined}
      linkLabel={t("home.openMap")}
    >
      {links.length > 0 ? (
        <div data-testid="map-thumbnail-list" className="flex flex-col gap-1.5">
          {links.slice(0, 4).map((link, index) => (
            <p key={index} className="truncate text-xs text-gray-600">
              {nameFor(link.fromObjectiveId)} → {nameFor(link.toObjectiveId)}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400">{t("home.noMapLinked")}</p>
      )}
    </WidgetCard>
  );
}
