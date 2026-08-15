import type { PlatformRole } from "@spm/domain-iam";

export type WidgetKey =
  | "kpiTiles"
  | "exceptions"
  | "scorecardStrip"
  | "reviewCalendar"
  | "mapThumbnail"
  | "ownedKpis"
  | "dueSubmissions"
  | "governanceEscalations"
  | "initiativesPlaceholder";

export const ROLE_WIDGETS: Partial<Record<PlatformRole, WidgetKey[]>> = {
  executive_viewer: ["kpiTiles", "exceptions", "scorecardStrip", "reviewCalendar", "mapThumbnail"],
  governance_committee: ["exceptions", "scorecardStrip", "reviewCalendar"],
  vmo_lead: ["kpiTiles", "exceptions", "scorecardStrip", "reviewCalendar", "mapThumbnail"],
  sector_leadership: ["kpiTiles", "scorecardStrip", "mapThumbnail"],
  kpi_owner: ["ownedKpis", "dueSubmissions", "exceptions"],
  initiative_owner: ["initiativesPlaceholder"],
  platform_administrator: [
    "kpiTiles",
    "exceptions",
    "scorecardStrip",
    "reviewCalendar",
    "mapThumbnail",
    "governanceEscalations",
  ],
};

export const DEFAULT_WIDGETS: WidgetKey[] = ["kpiTiles", "exceptions"];

export const HOME_ROLE_PRIORITY: PlatformRole[] = [
  "platform_administrator",
  "executive_viewer",
  "governance_committee",
  "vmo_lead",
  "seo_administrator",
  "sector_leadership",
  "strategy_analyst",
  "objective_play_owner",
  "benefit_owner",
  "data_steward",
  "kpi_owner",
  "initiative_owner",
];

export function resolveHomeRole(roles: readonly PlatformRole[]): PlatformRole | null {
  for (const candidate of HOME_ROLE_PRIORITY) {
    if (roles.includes(candidate)) return candidate;
  }
  return roles[0] ?? null;
}

export function widgetsForRole(role: PlatformRole | null): WidgetKey[] {
  if (!role) return DEFAULT_WIDGETS;
  return ROLE_WIDGETS[role] ?? DEFAULT_WIDGETS;
}

export function widgetsForRoles(roles: readonly PlatformRole[]): WidgetKey[] {
  return widgetsForRole(resolveHomeRole(roles));
}
