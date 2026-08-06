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

describe("CadenceEngine — ONCE", () => {
  it("returns the instant when it falls inside the window", () => {
    const spec: CadenceSpec = { type: "ONCE", runAt: "2026-08-05T09:00:00.000Z" };

    expect(occurrences(spec, "2026-08-05T00:00:00Z", "2026-08-06T00:00:00Z")).toEqual([
      "2026-08-05T09:00:00.000Z",
    ]);
  });

  it("returns nothing outside the window", () => {
    const spec: CadenceSpec = { type: "ONCE", runAt: "2026-09-05T09:00:00.000Z" };

    expect(occurrences(spec, "2026-08-05T00:00:00Z", "2026-08-06T00:00:00Z")).toEqual([]);
  });
});

describe("CadenceEngine — INTERVAL", () => {
  it("steps from the anchor, not from the window start", () => {
    const spec: CadenceSpec = { type: "INTERVAL", everySeconds: 3600 };

    const result = occurrences(
      spec,
      "2026-08-05T00:30:00Z",
      "2026-08-05T03:30:00Z",
      "UTC",
      "2026-08-05T00:00:00Z",
    );

    expect(result).toEqual([
      "2026-08-05T01:00:00.000Z",
      "2026-08-05T02:00:00.000Z",
      "2026-08-05T03:00:00.000Z",
    ]);
  });
});

describe("CadenceEngine — DAILY", () => {
  it("fires once per day at the configured wall clock", () => {
    const spec: CadenceSpec = { type: "DAILY", atTime: "09:00" };

    expect(occurrences(spec, "2026-08-05T00:00:00Z", "2026-08-08T00:00:00Z")).toEqual([
      "2026-08-05T09:00:00.000Z",
      "2026-08-06T09:00:00.000Z",
      "2026-08-07T09:00:00.000Z",
    ]);
  });

  it("honours a weekday filter", () => {
    // 2026-08-05 is a Wednesday.
    const spec: CadenceSpec = {
      type: "DAILY",
      atTime: "09:00",
      onWeekdays: [1, 3, 5],
    };

    expect(occurrences(spec, "2026-08-03T00:00:00Z", "2026-08-08T00:00:00Z")).toEqual([
      "2026-08-03T09:00:00.000Z",
      "2026-08-05T09:00:00.000Z",
      "2026-08-07T09:00:00.000Z",
    ]);
  });

  it("keeps the local wall clock stable across a DST transition", () => {
    const spec: CadenceSpec = { type: "DAILY", atTime: "09:00" };

    // New York moves to EDT on 2026-03-08: 09:00 local shifts from 14:00Z to
    // 13:00Z, which is the entire point of scheduling in a timezone.
    const result = occurrences(
      spec,
      "2026-03-06T00:00:00Z",
      "2026-03-11T00:00:00Z",
      "America/New_York",
    );

    expect(result).toEqual([
      "2026-03-06T14:00:00.000Z",
      "2026-03-07T14:00:00.000Z",
      "2026-03-08T13:00:00.000Z",
      "2026-03-09T13:00:00.000Z",
      "2026-03-10T13:00:00.000Z",
    ]);
  });
});

describe("CadenceEngine — WEEKLY", () => {
  it("respects everyNWeeks relative to the anchor week", () => {
    const spec: CadenceSpec = {
      type: "WEEKLY",
      atTime: "08:00",
      onWeekdays: [1],
      everyNWeeks: 2,
    };

    // Anchor in the week of Monday 2026-08-03.
    const result = occurrences(
      spec,
      "2026-08-01T00:00:00Z",
      "2026-09-01T00:00:00Z",
      "UTC",
      "2026-08-03T00:00:00Z",
    );

    expect(result).toEqual([
      "2026-08-03T08:00:00.000Z",
      "2026-08-17T08:00:00.000Z",
      "2026-08-31T08:00:00.000Z",
    ]);
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

    const result = occurrences(spec, "2026-01-01T00:00:00Z", "2026-05-01T00:00:00Z");

    expect(result).toEqual([
      "2026-01-31T09:00:00.000Z",
      "2026-02-28T09:00:00.000Z",
      "2026-03-31T09:00:00.000Z",
      "2026-04-30T09:00:00.000Z",
    ]);
  });

  it("skips the month entirely under SKIP_MONTH", () => {
    const spec: CadenceSpec = {
      type: "MONTHLY",
      atTime: "09:00",
      onDayOfMonth: 30,
      monthEndPolicy: "SKIP_MONTH",
    };

    const result = occurrences(spec, "2026-01-01T00:00:00Z", "2026-04-01T00:00:00Z");

    expect(result).toEqual([
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

    // The third Tuesday of August 2026 is the 18th.
    expect(occurrences(spec, "2026-08-01T00:00:00Z", "2026-09-01T00:00:00Z")).toEqual([
      "2026-08-18T10:00:00.000Z",
    ]);
  });

  it("resolves the last weekday of the month", () => {
    const spec: CadenceSpec = {
      type: "MONTHLY",
      atTime: "10:00",
      onNthWeekday: { nth: -1, weekday: 5 },
    };

    // The last Friday of August 2026 is the 28th.
    expect(occurrences(spec, "2026-08-01T00:00:00Z", "2026-09-01T00:00:00Z")).toEqual([
      "2026-08-28T10:00:00.000Z",
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

    const result = occurrences(
      spec,
      "2026-01-01T00:00:00Z",
      "2027-01-01T00:00:00Z",
      "UTC",
      "2026-01-01T00:00:00Z",
    );

    expect(result).toEqual([
      "2026-01-01T09:00:00.000Z",
      "2026-04-01T09:00:00.000Z",
      "2026-07-01T09:00:00.000Z",
      "2026-10-01T09:00:00.000Z",
    ]);
  });
});

describe("CadenceEngine — ANNUAL", () => {
  it("fires on the configured month and day", () => {
    const spec: CadenceSpec = {
      type: "ANNUAL",
      atTime: "00:00",
      onMonth: 4,
      onDayOfMonth: 1,
    };

    expect(occurrences(spec, "2026-01-01T00:00:00Z", "2028-01-01T00:00:00Z")).toEqual([
      "2026-04-01T00:00:00.000Z",
      "2027-04-01T00:00:00.000Z",
    ]);
  });
});

describe("CadenceEngine — CRON", () => {
  it("matches a stepped minute field", () => {
    const spec: CadenceSpec = { type: "CRON", expression: "*/15 9 * * *" };

    expect(occurrences(spec, "2026-08-05T08:00:00Z", "2026-08-05T10:00:00Z")).toEqual([
      "2026-08-05T09:00:00.000Z",
      "2026-08-05T09:15:00.000Z",
      "2026-08-05T09:30:00.000Z",
      "2026-08-05T09:45:00.000Z",
    ]);
  });

  it("treats restricted day-of-month and day-of-week as a union", () => {
    // Vixie semantics: the 5th OR any Monday.
    const spec: CadenceSpec = { type: "CRON", expression: "0 12 5 8 1" };

    const result = occurrences(spec, "2026-08-01T00:00:00Z", "2026-08-12T00:00:00Z");

    expect(result).toEqual([
      "2026-08-03T12:00:00.000Z",
      "2026-08-05T12:00:00.000Z",
      "2026-08-10T12:00:00.000Z",
    ]);
  });
});

describe("CadenceEngine — window semantics", () => {
  it("treats the window as half-open", () => {
    const spec: CadenceSpec = { type: "DAILY", atTime: "00:00" };

    const result = occurrences(spec, "2026-08-05T00:00:00Z", "2026-08-06T00:00:00Z");

    // The start instant is included, the end instant is not.
    expect(result).toEqual(["2026-08-05T00:00:00.000Z"]);
  });

  it("returns nothing for an inverted window", () => {
    const spec: CadenceSpec = { type: "DAILY", atTime: "09:00" };

    expect(occurrences(spec, "2026-08-06T00:00:00Z", "2026-08-05T00:00:00Z")).toEqual([]);
  });

  it("caps the number of occurrences returned", () => {
    const result = engine.occurrencesBetween({
      spec: { type: "DAILY", atTime: "09:00" },
      timeZone: "UTC",
      anchorAt: new Date("2026-01-01T00:00:00Z"),
      from: new Date("2026-01-01T00:00:00Z"),
      to: new Date("2026-02-01T00:00:00Z"),
      maxOccurrences: 5,
    });

    expect(result).toHaveLength(5);
  });
});

describe("CadenceEngine — nextOccurrenceAfter", () => {
  it("returns the first occurrence at or after the given instant", () => {
    const next = engine.nextOccurrenceAfter({
      spec: { type: "DAILY", atTime: "09:00" },
      timeZone: "UTC",
      anchorAt: new Date("2026-08-05T00:00:00Z"),
      from: new Date("2026-08-05T10:00:00Z"),
    });

    expect(next?.toISOString()).toBe("2026-08-06T09:00:00.000Z");
  });

  it("returns null when the cadence is exhausted", () => {
    const next = engine.nextOccurrenceAfter({
      spec: { type: "ONCE", runAt: "2026-01-01T00:00:00.000Z" },
      timeZone: "UTC",
      anchorAt: new Date("2026-01-01T00:00:00Z"),
      from: new Date("2026-08-05T00:00:00Z"),
    });

    expect(next).toBeNull();
  });
});
