import { describe, expect, it } from "vitest";
import { CadenceEngine } from "../../src/modules/cadence/cadence.engine";
import type { CadenceSpec } from "../../src/modules/cadence/cadence.types";

const engine = new CadenceEngine();

function occurrences(
  spec: CadenceSpec,
  from: string,
  to: string,
  timeZone = "UTC",
  anchorAt = from,
): string[] {
  return engine
    .occurrencesBetween({
      spec,
      timeZone,
      anchorAt: new Date(anchorAt),
      from: new Date(from),
      to: new Date(to),
      maxOccurrences: 100,
    })
    .map((occurrence) => occurrence.toISOString());
}

describe("CadenceEngine — ADHOC", () => {
  it("returns the instant when it falls inside the window", () => {
    const spec: CadenceSpec = {
      type: "ADHOC",
      runAt: "2026-08-05T09:00:00.000Z",
    };

    expect(
      occurrences(
        spec,
        "2026-08-05T00:00:00Z",
        "2026-08-06T00:00:00Z",
      ),
    ).toEqual(["2026-08-05T09:00:00.000Z"]);
  });

  it("returns nothing outside the window", () => {
    const spec: CadenceSpec = {
      type: "ADHOC",
      runAt: "2026-09-05T09:00:00.000Z",
    };

    expect(
      occurrences(
        spec,
        "2026-08-05T00:00:00Z",
        "2026-08-06T00:00:00Z",
      ),
    ).toEqual([]);
  });
});

describe("CadenceEngine — MONTHLY", () => {
  it("clamps a day that does not exist in a short month", () => {
    const spec: CadenceSpec = {
      type: "MONTHLY",
      atTime: "09:00",
      onDayOfMonth: 31,
      monthEndPolicy: "CLAMP_TO_LAST_DAY",
    };

    const result = occurrences(
      spec,
      "2026-01-01T00:00:00Z",
      "2026-05-01T00:00:00Z",
    );

    expect(result).toEqual([
      "2026-01-31T09:00:00.000Z",
      "2026-02-28T09:00:00.000Z",
      "2026-03-31T09:00:00.000Z",
      "2026-04-30T09:00:00.000Z",
    ]);
  });

  it("skips a short month under SKIP_MONTH", () => {
    const spec: CadenceSpec = {
      type: "MONTHLY",
      atTime: "09:00",
      onDayOfMonth: 30,
      monthEndPolicy: "SKIP_MONTH",
    };

    expect(
      occurrences(
        spec,
        "2026-01-01T00:00:00Z",
        "2026-04-01T00:00:00Z",
      ),
    ).toEqual([
      "2026-01-30T09:00:00.000Z",
      "2026-03-30T09:00:00.000Z",
    ]);
  });

  it("resolves the nth weekday of the month", () => {
    const spec: CadenceSpec = {
      type: "MONTHLY",
      atTime: "10:00",
      onNthWeekday: { nth: 3, weekday: 2 },
    };

    expect(
      occurrences(
        spec,
        "2026-08-01T00:00:00Z",
        "2026-09-01T00:00:00Z",
      ),
    ).toEqual(["2026-08-18T10:00:00.000Z"]);
  });

  it("resolves the last weekday of the month", () => {
    const spec: CadenceSpec = {
      type: "MONTHLY",
      atTime: "10:00",
      onNthWeekday: { nth: -1, weekday: 5 },
    };

    expect(
      occurrences(
        spec,
        "2026-08-01T00:00:00Z",
        "2026-09-01T00:00:00Z",
      ),
    ).toEqual(["2026-08-28T10:00:00.000Z"]);
  });

  it("respects everyNMonths relative to the anchor", () => {
    const spec: CadenceSpec = {
      type: "MONTHLY",
      atTime: "09:00",
      onDayOfMonth: 1,
      everyNMonths: 2,
    };

    expect(
      occurrences(
        spec,
        "2026-01-01T00:00:00Z",
        "2026-07-01T00:00:00Z",
        "UTC",
        "2026-01-01T00:00:00Z",
      ),
    ).toEqual([
      "2026-01-01T09:00:00.000Z",
      "2026-03-01T09:00:00.000Z",
      "2026-05-01T09:00:00.000Z",
    ]);
  });
});

describe("CadenceEngine — QUARTERLY", () => {
  it("fires once per quarter at the configured month offset", () => {
    const spec: CadenceSpec = {
      type: "QUARTERLY",
      atTime: "09:00",
      monthOffsetInQuarter: 0,
      onDayOfMonth: 1,
    };

    expect(
      occurrences(
        spec,
        "2026-01-01T00:00:00Z",
        "2027-01-01T00:00:00Z",
        "UTC",
        "2026-01-01T00:00:00Z",
      ),
    ).toEqual([
      "2026-01-01T09:00:00.000Z",
      "2026-04-01T09:00:00.000Z",
      "2026-07-01T09:00:00.000Z",
      "2026-10-01T09:00:00.000Z",
    ]);
  });
});

describe("CadenceEngine — window semantics", () => {
  it("treats the window as half-open", () => {
    const spec: CadenceSpec = {
      type: "ADHOC",
      runAt: "2026-08-05T00:00:00.000Z",
    };

    expect(
      occurrences(
        spec,
        "2026-08-05T00:00:00Z",
        "2026-08-06T00:00:00Z",
      ),
    ).toEqual(["2026-08-05T00:00:00.000Z"]);
  });

  it("returns nothing for an inverted window", () => {
    const spec: CadenceSpec = {
      type: "MONTHLY",
      atTime: "09:00",
      onDayOfMonth: 5,
    };

    expect(
      occurrences(
        spec,
        "2026-08-06T00:00:00Z",
        "2026-08-05T00:00:00Z",
      ),
    ).toEqual([]);
  });

  it("caps the number of occurrences returned", () => {
    const result = engine.occurrencesBetween({
      spec: {
        type: "MONTHLY",
        atTime: "09:00",
        onDayOfMonth: 1,
      },
      timeZone: "UTC",
      anchorAt: new Date("2026-01-01T00:00:00Z"),
      from: new Date("2026-01-01T00:00:00Z"),
      to: new Date("2027-01-01T00:00:00Z"),
      maxOccurrences: 3,
    });

    expect(result).toHaveLength(3);
  });
});

describe("CadenceEngine — nextOccurrenceAfter", () => {
  it("returns the next monthly occurrence", () => {
    const next = engine.nextOccurrenceAfter({
      spec: {
        type: "MONTHLY",
        atTime: "09:00",
        onDayOfMonth: 5,
      },
      timeZone: "UTC",
      anchorAt: new Date("2026-08-01T00:00:00Z"),
      from: new Date("2026-08-05T10:00:00Z"),
    });

    expect(next?.toISOString()).toBe("2026-09-05T09:00:00.000Z");
  });

  it("returns null when an ADHOC cadence is exhausted", () => {
    const next = engine.nextOccurrenceAfter({
      spec: {
        type: "ADHOC",
        runAt: "2026-01-01T00:00:00.000Z",
      },
      timeZone: "UTC",
      anchorAt: new Date("2026-01-01T00:00:00Z"),
      from: new Date("2026-08-05T00:00:00Z"),
    });

    expect(next).toBeNull();
  });
});
