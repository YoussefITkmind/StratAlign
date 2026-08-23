import { describe, expect, it } from "vitest";
import { resolveModule } from "@/lib/assistant/module-registry";

/**
 * The module registry is the assistant's "context resolver" — every module
 * page and the assistant panel depend on it to know where the user is. These
 * tests hold the contract that matters for extensibility: a real,
 * implemented module resolves to itself, a route with no registered
 * provider resolves honestly (never a fabricated module), and adding a
 * future module never has to touch this file's callers.
 */

describe("resolveModule", () => {
  it("resolves each currently implemented module from its route", () => {
    expect(resolveModule("/strategy-hierarchy").id).toBe("strategy_hierarchy");
    expect(resolveModule("/balanced-scorecards").id).toBe("balanced_scorecards");
    expect(resolveModule("/balanced-scorecards/some-id").id).toBe("balanced_scorecards");
    expect(resolveModule("/kpis-okrs").id).toBe("kpis_okrs");
    expect(resolveModule("/initiatives-projects").id).toBe("initiatives_projects");
    expect(resolveModule("/initiatives-projects/some-id").id).toBe("initiatives_projects");
    expect(resolveModule("/governance").id).toBe("governance");
  });

  it("resolves Governance Hub distinctly from Governance despite the shared prefix", () => {
    expect(resolveModule("/governance/hub").id).toBe("governance_hub");
    expect(resolveModule("/governance/hub").hasProvider).toBe(false);
    expect(resolveModule("/governance").id).toBe("governance");
  });

  it("marks every implemented module as having a provider, with real capabilities", () => {
    for (const route of [
      "/strategy-hierarchy",
      "/balanced-scorecards",
      "/kpis-okrs",
      "/initiatives-projects",
      "/governance",
    ]) {
      const moduleDef = resolveModule(route);
      expect(moduleDef.hasProvider).toBe(true);
      expect(moduleDef.capabilities.length).toBeGreaterThan(0);
    }
  });

  it("resolves a future/unimplemented module honestly, without fake capabilities", () => {
    for (const route of ["/dashboards", "/reports", "/data-integrations", "/settings"]) {
      const moduleDef = resolveModule(route);
      expect(moduleDef.hasProvider).toBe(false);
      expect(moduleDef.capabilities).toEqual([]);
    }
  });

  it("falls back to a generic module for a route nothing has registered", () => {
    const moduleDef = resolveModule("/some-route-nobody-registered");
    expect(moduleDef.id).toBe("general");
    expect(moduleDef.hasProvider).toBe(false);
  });
});
