import { describe, expect, it } from "vitest";
import { PLATFORM_ROLES, type PlatformRole } from "@spm/domain-iam";
import {
  DEFAULT_WIDGETS,
  HOME_ROLE_PRIORITY,
  ROLE_WIDGETS,
  resolveHomeRole,
  widgetsForRole,
  widgetsForRoles,
} from "../src/lib/roleWidgetConfig";

describe("resolveHomeRole", () => {
  it("returns null for a user with no granted roles", () => {
    expect(resolveHomeRole([])).toBeNull();
  });

  it("picks the single granted role when there is exactly one", () => {
    expect(resolveHomeRole(["kpi_owner"])).toBe("kpi_owner");
  });

  it("prefers the higher-priority role when a user holds several", () => {
    expect(resolveHomeRole(["kpi_owner", "executive_viewer"])).toBe("executive_viewer");
    expect(resolveHomeRole(["initiative_owner", "platform_administrator"])).toBe("platform_administrator");
  });

  it("falls back to the only role held even if it's unranked in HOME_ROLE_PRIORITY", () => {
    // Guards against HOME_ROLE_PRIORITY silently drifting out of sync with PLATFORM_ROLES.
    const unranked = PLATFORM_ROLES.find((role) => !HOME_ROLE_PRIORITY.includes(role));
    if (!unranked) return;
    expect(resolveHomeRole([unranked])).toBe(unranked);
  });

  it("ranks every PlatformRole exactly once", () => {
    expect(new Set(HOME_ROLE_PRIORITY).size).toBe(HOME_ROLE_PRIORITY.length);
    for (const role of HOME_ROLE_PRIORITY) {
      expect(PLATFORM_ROLES).toContain(role);
    }
  });
});

describe("widgetsForRole", () => {
  it("returns the DEFAULT_WIDGETS fallback for a null role", () => {
    expect(widgetsForRole(null)).toEqual(DEFAULT_WIDGETS);
  });

  it("returns the executive_viewer composition: KPI tiles, exceptions, scorecard strip, review calendar, map thumbnail", () => {
    expect(widgetsForRole("executive_viewer")).toEqual([
      "kpiTiles",
      "exceptions",
      "scorecardStrip",
      "reviewCalendar",
      "mapThumbnail",
    ]);
  });

  it("returns the kpi_owner composition: owned KPIs, due submissions, exceptions", () => {
    expect(widgetsForRole("kpi_owner")).toEqual(["ownedKpis", "dueSubmissions", "exceptions"]);
  });

  it("returns a placeholder-only composition for initiative_owner (Phase 4 not built yet)", () => {
    expect(widgetsForRole("initiative_owner")).toEqual(["initiativesPlaceholder"]);
  });

  it("gives platform_administrator every widget, including the real-backend governance escalations widget", () => {
    expect(widgetsForRole("platform_administrator")).toContain("governanceEscalations");
  });

  it("produces a genuinely different composition for executive_viewer vs kpi_owner", () => {
    const execWidgets = widgetsForRole("executive_viewer");
    const ownerWidgets = widgetsForRole("kpi_owner");
    expect(execWidgets).not.toEqual(ownerWidgets);
  });

  it("falls back to DEFAULT_WIDGETS for any role without an explicit composition", () => {
    const uncomposed = PLATFORM_ROLES.filter((role) => !(role in ROLE_WIDGETS));
    for (const role of uncomposed) {
      expect(widgetsForRole(role)).toEqual(DEFAULT_WIDGETS);
    }
  });
});

describe("widgetsForRoles", () => {
  it("composes end to end from a raw roles array, same as the server passes down from getCurrentAuthorization()", () => {
    const roles: PlatformRole[] = ["kpi_owner"];
    expect(widgetsForRoles(roles)).toEqual(widgetsForRole("kpi_owner"));
  });

  it("resolves the priority role first, then composes its widgets", () => {
    const roles: PlatformRole[] = ["initiative_owner", "executive_viewer"];
    expect(widgetsForRoles(roles)).toEqual(widgetsForRole("executive_viewer"));
  });
});
