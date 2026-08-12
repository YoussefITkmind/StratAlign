import type { PlatformRole } from "@spm/domain-iam";

/**
 * Every widget the Home landing screen knows how to render. This is the
 * fixed, role-driven composition described for this phase — a user-configurable
 * canvas (add/remove/reorder widgets per user) is Phase 7 Prompt 7.2, not this one.
 */
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

/**
 * Default widget set per PlatformRole. Roles not listed here fall back to
 * DEFAULT_WIDGETS. `governanceEscalations` is real backend data (the
 * `governance.myPendingApprovals` procedure) and is gated to
 * `platform_administrator` because that procedure itself is admin-only
 * server-side (see apps/frontend/src/server/trpc.ts `adminProcedure`) — every
 * other widget here is fixture data from the Phase 2/3 mock datasets.
 */
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

/**
 * When a user holds several PlatformRoles (scopeGrants are per-object, so
 * this is common), Home needs one deterministic composition to render.
 * Ordered most-senior/most-specific first — an executive who also happens to
 * hold kpi_owner on one scope still gets the broader executive composition.
 */
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
