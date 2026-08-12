"use client";

import { useMemo } from "react";
import type { PlatformRole } from "@spm/domain-iam";
import { initialKpis } from "@/data/mockKpiData";
import { initialCadenceTasks } from "@/data/mockCadenceTasks";
import { initialScorecards } from "@/data/mockScorecardData";
import { initialMaps } from "@/data/mockMapData";
import { committees, risks, initialApprovals, MOCK_NOW } from "@/data/mockGovernanceData";
import { widgetsForRole, resolveHomeRole, type WidgetKey } from "@/lib/roleWidgetConfig";
import { selectTopKpis, selectExceptions, kpisOwnedBy, cadenceTasksFor, buildReviewCalendar, HOME_DEMO_OWNER_NAME } from "@/lib/homeConfig";
import { useI18n } from "@/lib/i18n/locale-context";
import { KpiTilesWidget } from "./KpiTilesWidget";
import { ExceptionsWidget } from "./ExceptionsWidget";
import { ScorecardStripWidget } from "./ScorecardStripWidget";
import { ReviewCalendarWidget } from "./ReviewCalendarWidget";
import { MapThumbnailWidget } from "./MapThumbnailWidget";
import { OwnedKpisWidget } from "./OwnedKpisWidget";
import { DueSubmissionsWidget } from "./DueSubmissionsWidget";
import { InitiativesPlaceholderWidget } from "./InitiativesPlaceholderWidget";
import { GovernanceEscalationsWidget } from "./GovernanceEscalationsWidget";

const WIDGET_SPAN: Record<WidgetKey, string> = {
  kpiTiles: "lg:col-span-2",
  exceptions: "lg:col-span-1",
  scorecardStrip: "lg:col-span-2",
  reviewCalendar: "lg:col-span-1",
  mapThumbnail: "lg:col-span-1",
  ownedKpis: "lg:col-span-1",
  dueSubmissions: "lg:col-span-1",
  governanceEscalations: "lg:col-span-1",
  initiativesPlaceholder: "lg:col-span-2",
};

export function HomePage({ roles }: { roles: PlatformRole[] }) {
  const { t } = useI18n();
  const role = useMemo(() => resolveHomeRole(roles), [roles]);
  const widgets = useMemo(() => widgetsForRole(role), [role]);

  const ownedKpis = useMemo(() => kpisOwnedBy(initialKpis, HOME_DEMO_OWNER_NAME), []);
  const kpiNameById = useMemo(() => Object.fromEntries(initialKpis.map((k) => [k.id, k.name])), []);
  const reviewCalendarItems = useMemo(
    () => buildReviewCalendar(committees, risks, initialApprovals, MOCK_NOW),
    []
  );
  const thumbnailMap = useMemo(
    () => initialMaps.find((m) => m.id === initialScorecards.find((sc) => sc.mapId)?.mapId),
    []
  );

  function renderWidget(key: WidgetKey) {
    switch (key) {
      case "kpiTiles":
        return <KpiTilesWidget kpis={selectTopKpis(initialKpis)} />;
      case "exceptions":
        return <ExceptionsWidget kpis={selectExceptions(initialKpis)} />;
      case "scorecardStrip":
        return <ScorecardStripWidget scorecards={initialScorecards} />;
      case "reviewCalendar":
        return <ReviewCalendarWidget items={reviewCalendarItems} />;
      case "mapThumbnail":
        return <MapThumbnailWidget map={thumbnailMap} />;
      case "ownedKpis":
        return <OwnedKpisWidget kpis={ownedKpis} />;
      case "dueSubmissions":
        return (
          <DueSubmissionsWidget
            tasks={cadenceTasksFor(initialCadenceTasks, ownedKpis.map((k) => k.id))}
            kpiNameById={kpiNameById}
          />
        );
      case "initiativesPlaceholder":
        return <InitiativesPlaceholderWidget />;
      case "governanceEscalations":
        return <GovernanceEscalationsWidget />;
      default:
        return null;
    }
  }

  return (
    <div data-testid="home-page" className="mx-auto max-w-[1400px]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900">{t("home.title")}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{t("home.subtitle")}</p>
        </div>
        {role && (
          <span data-testid="home-role-label" className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
            {t(`common.role_${role}`)}
          </span>
        )}
      </div>

      {!role && (
        <div data-testid="home-no-role-notice" className="mb-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500">
          {t("home.noRoleNotice")}
        </div>
      )}

      <div data-testid="home-widgets" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {widgets.map((key) => (
          <div key={key} data-testid={`widget-slot-${key}`} className={WIDGET_SPAN[key]}>
            {renderWidget(key)}
          </div>
        ))}
      </div>
    </div>
  );
}
