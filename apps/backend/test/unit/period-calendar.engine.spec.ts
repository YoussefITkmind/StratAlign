import { describe, expect, it } from "vitest";
import { PeriodCalendarEngine } from "../../src/modules/cadence/period-calendar.engine";
import { PeriodType } from "../../src/generated/prisma/enums";

const engine = new PeriodCalendarEngine();

describe("PeriodCalendarEngine — MONTH", () => {
  it("resolves the containing calendar month", () => {
    const period = engine.resolvePeriod(
      {
        periodType: PeriodType.MONTH,
        fiscalYearStartMonth: 1,
        timezone: "UTC",
      },
      new Date("2026-08-05T12:00:00Z"),
    );

    expect(period.key).toBe("2026-08");
    expect(period.startsAt.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(period.endsAt.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("resolves month boundaries in the calendar's own timezone", () => {
    const period = engine.resolvePeriod(
      {
        periodType: PeriodType.MONTH,
        fiscalYearStartMonth: 1,
        timezone: "Asia/Dubai",
      },
      new Date("2026-08-05T12:00:00Z"),
    );

    // Midnight in Dubai (UTC+4) is 20:00 the previous day in UTC.
    expect(period.startsAt.toISOString()).toBe("2026-07-31T20:00:00.000Z");
  });

  it("places an instant just before local midnight in the earlier month", () => {
    // 2026-08-31T21:00Z is 2026-09-01T01:00 in Dubai, so it belongs to
    // September there even though it is still August in UTC.
    const period = engine.resolvePeriod(
      {
        periodType: PeriodType.MONTH,
        fiscalYearStartMonth: 1,
        timezone: "Asia/Dubai",
      },
      new Date("2026-08-31T21:00:00Z"),
    );

    expect(period.key).toBe("2026-09");
  });
});

describe("PeriodCalendarEngine — QUARTER", () => {
  it("resolves calendar quarters when the fiscal year starts in January", () => {
    const period = engine.resolvePeriod(
      {
        periodType: PeriodType.QUARTER,
        fiscalYearStartMonth: 1,
        timezone: "UTC",
      },
      new Date("2026-08-05T12:00:00Z"),
    );

    expect(period.key).toBe("2026-Q3");
    expect(period.startsAt.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(period.endsAt.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("shifts quarters for a fiscal year starting in April", () => {
    const period = engine.resolvePeriod(
      {
        periodType: PeriodType.QUARTER,
        fiscalYearStartMonth: 4,
        timezone: "UTC",
      },
      new Date("2026-08-05T12:00:00Z"),
    );

    // April-June is Q1, so August falls in Q2 of the fiscal year starting 2026.
    expect(period.key).toBe("FY2026-Q2");
    expect(period.startsAt.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("assigns January to the previous fiscal year when the year starts in April", () => {
    const period = engine.resolvePeriod(
      {
        periodType: PeriodType.QUARTER,
        fiscalYearStartMonth: 4,
        timezone: "UTC",
      },
      new Date("2026-01-15T12:00:00Z"),
    );

    expect(period.key).toBe("FY2025-Q4");
  });
});

describe("PeriodCalendarEngine — YEAR", () => {
  it("resolves a calendar year", () => {
    const period = engine.resolvePeriod(
      { periodType: PeriodType.YEAR, fiscalYearStartMonth: 1, timezone: "UTC" },
      new Date("2026-08-05T12:00:00Z"),
    );

    expect(period.key).toBe("2026");
    expect(period.startsAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(period.endsAt.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("resolves a fiscal year starting in April", () => {
    const period = engine.resolvePeriod(
      { periodType: PeriodType.YEAR, fiscalYearStartMonth: 4, timezone: "UTC" },
      new Date("2026-08-05T12:00:00Z"),
    );

    expect(period.key).toBe("FY2026");
    expect(period.startsAt.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(period.endsAt.toISOString()).toBe("2027-04-01T00:00:00.000Z");
  });
});

describe("PeriodCalendarEngine — WEEK", () => {
  it("starts weeks on Monday", () => {
    // 2026-08-05 is a Wednesday; its week starts Monday 2026-08-03.
    const period = engine.resolvePeriod(
      { periodType: PeriodType.WEEK, fiscalYearStartMonth: 1, timezone: "UTC" },
      new Date("2026-08-05T12:00:00Z"),
    );

    expect(period.startsAt.toISOString()).toBe("2026-08-03T00:00:00.000Z");
    expect(period.endsAt.toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(period.key).toMatch(/^2026-W\d{2}$/);
  });
});
