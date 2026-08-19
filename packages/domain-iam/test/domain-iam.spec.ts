import { describe, expect, it } from "vitest";
import {
  enforceSeparationOfDuties,
  ORG_SCOPE_TYPES,
  orgScopeTypeSchema,
  PLATFORM_ROLES,
  platformRoleSchema,
  SeparationOfDutiesError,
} from "../src";

describe("IAM domain", () => {
  it("defines the exact canonical roles", () => {
    expect(PLATFORM_ROLES).toEqual([
      "executive_viewer", "sector_leadership", "objective_play_owner",
      "initiative_owner", "kpi_owner", "data_steward", "bi_data_lead",
      "vmo_lead", "benefit_owner", "strategy_analyst",
      "governance_committee", "seo_administrator", "platform_administrator",
    ]);
  });

  it("validates canonical roles and rejects unknown roles", () => {
    expect(platformRoleSchema.parse("kpi_owner")).toBe("kpi_owner");
    expect(() => platformRoleSchema.parse("member")).toThrow();
  });

  it("validates only canonical organizational scope types", () => {
    expect(ORG_SCOPE_TYPES).toEqual(["group", "sector", "function"]);
    expect(orgScopeTypeSchema.safeParse("sector").success).toBe(true);
    expect(orgScopeTypeSchema.safeParse("global").success).toBe(false);
  });

  it("allows different actors and submitters", () => {
    expect(() => enforceSeparationOfDuties("actor", "submitter")).not.toThrow();
  });

  it("rejects self-approval with the canonical safe error", () => {
    expect(() => enforceSeparationOfDuties("same", "same"))
      .toThrow(SeparationOfDutiesError);
  });
});
