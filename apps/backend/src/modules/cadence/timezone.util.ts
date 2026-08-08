/**
 * IANA timezone arithmetic built on `Intl.DateTimeFormat`, which Node ships
 * with full ICU data. No date library is introduced: the surface actually
 * needed here is narrow (wall clock <-> instant, plus calendar day maths) and
 * being dependency-free keeps the engine trivially testable.
 */

export interface ZonedParts {
  year: number;
  /** 1-12, unlike `Date`'s zero-based month. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);

  if (cached) {
    return cached;
  }

  let formatter: Intl.DateTimeFormat;

  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch (error: unknown) {
    throw new Error(`Unknown IANA time zone: "${timeZone}"`, { cause: error });
  }

  formatterCache.set(timeZone, formatter);

  return formatter;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function toZonedParts(timeZone: string, instant: Date): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const lookup: Record<string, number> = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      lookup[part.type] = Number.parseInt(part.value, 10);
    }
  }

  return {
    year: lookup.year,
    month: lookup.month,
    day: lookup.day,
    hour: lookup.hour,
    minute: lookup.minute,
    second: lookup.second,
  };
}

/**
 * Offset of `timeZone` at a given instant, in milliseconds east of UTC.
 * Positive for Asia/Dubai, negative for America/New_York.
 */
export function zoneOffsetMsAt(timeZone: string, utcMilliseconds: number): number {
  const truncated = Math.floor(utcMilliseconds / 1000) * 1000;
  const parts = toZonedParts(timeZone, new Date(truncated));

  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return asIfUtc - truncated;
}

/**
 * Resolves a wall-clock reading in `timeZone` to the instant it denotes.
 *
 * Two readings are not straightforward:
 *
 * - Ambiguous (clocks go back; the reading happens twice). The *first*
 *   occurrence is returned, which is also what the unique constraint on
 *   `(cadence_definition_id, occurrence_at)` would collapse to anyway.
 * - Non-existent (clocks go forward; the reading is skipped). The instant
 *   just after the gap is returned — a 02:30 daily cadence still fires on the
 *   spring-forward day rather than silently going missing.
 */
export function fromZonedParts(timeZone: string, parts: ZonedParts): Date {
  const naiveUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  // Probe on both sides of the reading so a transition within ±12h is seen.
  const candidates = new Set<number>();

  for (const probe of [naiveUtc, naiveUtc - TWELVE_HOURS_MS, naiveUtc + TWELVE_HOURS_MS]) {
    candidates.add(naiveUtc - zoneOffsetMsAt(timeZone, probe));
  }

  const valid = [...candidates]
    .filter((candidate) => zoneOffsetMsAt(timeZone, candidate) === naiveUtc - candidate)
    .sort((left, right) => left - right);

  if (valid.length > 0) {
    return new Date(valid[0]);
  }

  return new Date(Math.max(...candidates));
}

// ---------------------------------------------------------------------------
// Civil (proleptic Gregorian) date arithmetic
//
// Day stepping is done on integer day numbers rather than on `Date`, so adding
// a day never accidentally adds 23 or 25 hours across a DST boundary. The
// wall-clock reading is only resolved to an instant at the very end.
// ---------------------------------------------------------------------------

/** Days since 1970-01-01 for a civil date. Hinnant's `days_from_civil`. */
export function civilToDays(year: number, month: number, day: number): number {
  const shiftedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor((shiftedYear >= 0 ? shiftedYear : shiftedYear - 399) / 400);
  const yearOfEra = shiftedYear - era * 400;
  const dayOfYear =
    Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;

  return era * 146097 + dayOfEra - 719468;
}

/** Inverse of `civilToDays`. */
export function daysToCivil(days: number): { year: number; month: number; day: number } {
  const shifted = days + 719468;
  const era = Math.floor((shifted >= 0 ? shifted : shifted - 146096) / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra =
    Math.floor(
      dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096),
    ) / 365;
  const flooredYearOfEra = Math.floor(yearOfEra);
  const year = flooredYearOfEra + era * 400;
  const dayOfYear =
    dayOfEra -
    (365 * flooredYearOfEra + Math.floor(flooredYearOfEra / 4) - Math.floor(flooredYearOfEra / 100));
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime + (monthPrime < 10 ? 3 : -9);

  return {
    year: year + (month <= 2 ? 1 : 0),
    month,
    day,
  };
}

/** 0 = Sunday through 6 = Saturday. */
export function weekdayFromDays(days: number): number {
  return ((days + 4) % 7 + 7) % 7;
}

export function daysInMonth(year: number, month: number): number {
  return civilToDays(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1) -
    civilToDays(year, month, 1);
}
