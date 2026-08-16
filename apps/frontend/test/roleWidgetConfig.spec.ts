import { describe, expect, it } from "vitest";
import { resolveHomeRole, widgetsForRole, widgetsForRoles } from "@/lib/roleWidgetConfig";

describe("Home role widget mapping", () => {
  it("gives executives the checkpoint summary widgets", () => {
    expect(widgetsForRole("executive_viewer")).toEqual([
      "kpiTiles",
      "exceptions",
      "scorecardStrip",
      "reviewCalendar",
      "mapThumbnail",
    ]);
  });

  it("gives KPI owners exactly the owner-focused checkpoint composition", () => {
    expect(widgetsForRole("kpi_owner")).toEqual([
      "ownedKpis",
      "dueSubmissions",
    ]);
  });

  it("uses deterministic priority when several roles are present", () => {
    expect(resolveHomeRole(["kpi_owner", "executive_viewer"])).toBe("executive_viewer");
    expect(widgetsForRoles(["kpi_owner", "executive_viewer"])).toEqual(widgetsForRole("executive_viewer"));
  });

  it("falls back to a useful default for an unmapped role", () => {
    expect(widgetsForRole("strategy_analyst")).toEqual(["kpiTiles", "exceptions"]);
  });
});
