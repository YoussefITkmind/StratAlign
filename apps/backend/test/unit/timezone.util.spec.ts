import { describe, expect, it } from "vitest";
import {
  civilToDays,
  daysInMonth,
  daysToCivil,
  fromZonedParts,
  toZonedParts,
  weekdayFromDays,
  zoneOffsetMsAt,
} from "../../src/modules/cadence/timezone.util";

const HOUR_MS = 60 * 60 * 1000;

describe("civil date arithmetic", () => {
  it("round-trips civil dates through day numbers", () => {
    for (const date of [
      { year: 1970, month: 1, day: 1 },
      { year: 2000, month: 2, day: 29 },
      { year: 2026, month: 8, day: 5 },
      { year: 2100, month: 12, day: 31 },
    ]) {
      const days = civilToDays(date.year, date.month, date.day);
      expect(daysToCivil(days)).toEqual(date);
    }
  });

  it("anchors the epoch to a Thursday", () => {
    expect(weekdayFromDays(civilToDays(1970, 1, 1))).toBe(4);
  });

  it("knows leap years", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });
});

describe("zoneOffsetMsAt", () => {
  it("reports UTC as having no offset", () => {
    expect(zoneOffsetMsAt("UTC", Date.UTC(2026, 6, 1))).toBe(0);
  });

  it("reports a positive offset east of UTC", () => {
    expect(zoneOffsetMsAt("Asia/Dubai", Date.UTC(2026, 6, 1))).toBe(4 * HOUR_MS);
  });

  it("tracks daylight saving in a northern-hemisphere zone", () => {
    const winter = zoneOffsetMsAt("America/New_York", Date.UTC(2026, 0, 15));
    const summer = zoneOffsetMsAt("America/New_York", Date.UTC(2026, 6, 15));

    expect(winter).toBe(-5 * HOUR_MS);
    expect(summer).toBe(-4 * HOUR_MS);
  });
});

describe("fromZonedParts", () => {
  it("resolves an ordinary wall-clock reading", () => {
    const instant = fromZonedParts("Asia/Dubai", {
      year: 2026,
      month: 8,
      day: 5,
      hour: 9,
      minute: 30,
      second: 0,
    });

    // 09:30 in Dubai (UTC+4) is 05:30 UTC.
    expect(instant.toISOString()).toBe("2026-08-05T05:30:00.000Z");
  });

  it("round-trips through toZonedParts", () => {
    const parts = {
      year: 2026,
      month: 11,
      day: 3,
      hour: 14,
      minute: 15,
      second: 0,
    };

    const instant = fromZonedParts("Europe/Berlin", parts);

    expect(toZonedParts("Europe/Berlin", instant)).toEqual(parts);
  });

  it("shifts a non-existent spring-forward reading past the gap", () => {
    // On 2026-03-08 New York jumps 02:00 -> 03:00, so 02:30 never happens.
    const instant = fromZonedParts("America/New_York", {
      year: 2026,
      month: 3,
      day: 8,
      hour: 2,
      minute: 30,
      second: 0,
    });

    const parts = toZonedParts("America/New_York", instant);

    // The cadence still fires that day rather than silently disappearing.
    expect(parts.day).toBe(8);
    expect(parts.hour).toBe(3);
    expect(parts.minute).toBe(30);
  });

  it("resolves an ambiguous fall-back reading to its first occurrence", () => {
    // On 2026-11-01 New York repeats 01:00-02:00.
    const instant = fromZonedParts("America/New_York", {
      year: 2026,
      month: 11,
      day: 1,
      hour: 1,
      minute: 30,
      second: 0,
    });

    // The first 01:30 is still on EDT (UTC-4), i.e. 05:30 UTC.
    expect(instant.toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
});
