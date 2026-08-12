import { describe, expect, it } from "vitest";
import { validateMapLink } from "../../src/modules/scorecard/scorecard.validation";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("strategy-map link validation", () => {
  it.each(["weak", "strong"] as const)("accepts %s strength", (strength) => {
    expect(validateMapLink({ fromObjectiveId: A, toObjectiveId: B, strength })).toEqual({
      fromObjectiveId: A,
      toObjectiveId: B,
      strength,
    });
  });

  it("rejects unsupported link strength", () => {
    expect(() => validateMapLink({ fromObjectiveId: A, toObjectiveId: B, strength: "medium" })).toThrow();
  });

  it("rejects self-links", () => {
    expect(() => validateMapLink({ fromObjectiveId: A, toObjectiveId: A, strength: "strong" })).toThrow(/cannot target the same objective/i);
  });
});
