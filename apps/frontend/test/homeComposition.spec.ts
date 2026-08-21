import { describe, expect, it } from "vitest";
import { ROLE_WIDGETS, DEFAULT_WIDGETS } from "@/lib/roleWidgetConfig";
import { resolveHomeComposition } from "@/server/home-composition";

describe("server-authoritative Home composition", () => {
  it("preserves every explicit role composition", () => {
    for (const [role, widgets] of Object.entries(ROLE_WIDGETS)) {
      expect(resolveHomeComposition([role as keyof typeof ROLE_WIDGETS])).toEqual({ role, widgets });
    }
  });

  it("uses deterministic role priority for users with multiple roles", () => {
    expect(resolveHomeComposition(["kpi_owner", "executive_viewer"])).toEqual({
      role: "executive_viewer",
      widgets: ROLE_WIDGETS.executive_viewer,
    });
  });

  it("uses the unchanged fallback composition", () => {
    expect(resolveHomeComposition(["strategy_analyst"])).toEqual({
      role: "strategy_analyst",
      widgets: DEFAULT_WIDGETS,
    });
  });
});
