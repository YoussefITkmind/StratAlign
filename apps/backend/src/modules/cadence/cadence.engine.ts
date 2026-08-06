import { PermanentError } from "../../errors/app.errors";
import type {
  CadenceEvaluationInput,
  CadenceSpec,
  MonthEndPolicy,
  TimeOfDay,
} from "./cadence.types";
import {
  civilToDays,
  daysInMonth,
  daysToCivil,
  fromZonedParts,
  toZonedParts,
  weekdayFromDays,
} from "./timezone.util";

/**
 * Upper bounds on a single evaluation. A definition whose window has grown
 * enormous (a worker outage, a back-dated `startsAt`) must not be able to spin
 * the event loop; callers clamp the window too, this is the last line.
 */
const MAX_SCANNED_DAYS = 800;
const MAX_SCANNED_MONTHS = 400;
const MAX_SCANNED_CRON_MINUTES = 31 * 24 * 60;

const MINUTE_MS = 60 * 1000;

function parseTimeOfDay(value: string): TimeOfDay {
  const [hour, minute, second] = value.split(":");

  return {
    hour: Number.parseInt(hour, 10),
    minute: Number.parseInt(minute, 10),
    second: second === undefined ? 0 : Number.parseInt(second, 10),
  };
}

/**
 * Deterministic, side-effect free translation of a cadence specification into
 * the instants it denotes. No database, no clock, no queue: the same inputs
 * always yield the same output, which is what makes DST and month-end
 * behaviour exhaustively testable.
 */
export class CadenceEngine {
  occurrencesBetween(input: CadenceEvaluationInput): Date[] {
    if (input.to.getTime() <= input.from.getTime()) {
      return [];
    }

    const occurrences = this.generate(input);

    return occurrences
      .filter(
        (occurrence) =>
          occurrence.getTime() >= input.from.getTime() &&
          occurrence.getTime() < input.to.getTime(),
      )
      .sort((left, right) => left.getTime() - right.getTime())
      .slice(0, input.maxOccurrences);
  }

  /**
   * The next occurrence at or after `from`, or null if the cadence is
   * exhausted within `horizonDays`. Used to maintain `nextOccurrenceAt`, which
   * is the column the scheduler tick actually queries on.
   */
  nextOccurrenceAfter(
    input: Omit<CadenceEvaluationInput, "to" | "maxOccurrences">,
    horizonDays = 400,
  ): Date | null {
    const to = new Date(input.from.getTime() + horizonDays * 24 * 60 * 60 * 1000);

    const [next] = this.occurrencesBetween({
      ...input,
      to,
      maxOccurrences: 1,
    });

    return next ?? null;
  }

  private generate(input: CadenceEvaluationInput): Date[] {
    switch (input.spec.type) {
      case "ONCE":
        return [new Date(input.spec.runAt)];

      case "INTERVAL":
        return this.generateInterval(input, input.spec.everySeconds);

      case "DAILY":
        return this.generateDaily(input, input.spec.atTime, input.spec.onWeekdays);

      case "WEEKLY":
        return this.generateWeekly(input);

      case "MONTHLY":
      case "QUARTERLY":
      case "ANNUAL":
        return this.generateMonthBased(input);

      case "CRON":
        return this.generateCron(input, input.spec.expression);

      default: {
        // Exhaustiveness guard: a new cadence type must be handled here.
        const unreachable: never = input.spec;
        throw new PermanentError("Unsupported cadence type", {
          spec: unreachable,
        });
      }
    }
  }

  private generateInterval(
    input: CadenceEvaluationInput,
    everySeconds: number,
  ): Date[] {
    const stepMs = everySeconds * 1000;
    const anchorMs = input.anchorAt.getTime();
    const elapsed = input.from.getTime() - anchorMs;
    const firstIndex = Math.max(0, Math.ceil(elapsed / stepMs));

    const occurrences: Date[] = [];

    for (let index = firstIndex; occurrences.length <= input.maxOccurrences; index += 1) {
      const candidate = anchorMs + index * stepMs;

      if (candidate >= input.to.getTime()) {
        break;
      }

      occurrences.push(new Date(candidate));
    }

    return occurrences;
  }

  private generateDaily(
    input: CadenceEvaluationInput,
    atTime: string,
    onWeekdays: readonly number[] | undefined,
  ): Date[] {
    const time = parseTimeOfDay(atTime);
    const allowed =
      onWeekdays === undefined ? null : new Set<number>(onWeekdays);

    return this.scanDays(input, (days) => {
      if (allowed !== null && !allowed.has(weekdayFromDays(days))) {
        return null;
      }

      return this.instantFor(input.timeZone, days, time);
    });
  }

  private generateWeekly(input: CadenceEvaluationInput): Date[] {
    if (input.spec.type !== "WEEKLY") {
      return [];
    }

    const { atTime, onWeekdays, everyNWeeks = 1 } = input.spec;
    const time = parseTimeOfDay(atTime);
    const allowed = new Set<number>(onWeekdays);

    const anchorParts = toZonedParts(input.timeZone, input.anchorAt);
    const anchorDays = civilToDays(
      anchorParts.year,
      anchorParts.month,
      anchorParts.day,
    );
    // Weeks are compared by their Sunday, so a cadence's phase does not shift
    // depending on which weekday the anchor happened to fall on.
    const anchorWeekStart = anchorDays - weekdayFromDays(anchorDays);

    return this.scanDays(input, (days) => {
      if (!allowed.has(weekdayFromDays(days))) {
        return null;
      }

      const weekStart = days - weekdayFromDays(days);
      const weeksSinceAnchor = Math.round((weekStart - anchorWeekStart) / 7);

      if (((weeksSinceAnchor % everyNWeeks) + everyNWeeks) % everyNWeeks !== 0) {
        return null;
      }

      return this.instantFor(input.timeZone, days, time);
    });
  }

  private generateMonthBased(input: CadenceEvaluationInput): Date[] {
    const spec = input.spec;

    if (
      spec.type !== "MONTHLY" &&
      spec.type !== "QUARTERLY" &&
      spec.type !== "ANNUAL"
    ) {
      return [];
    }

    const time = parseTimeOfDay(spec.atTime);
    const anchorParts = toZonedParts(input.timeZone, input.anchorAt);
    const anchorMonthIndex = anchorParts.year * 12 + (anchorParts.month - 1);

    const fromParts = toZonedParts(input.timeZone, input.from);
    const toParts = toZonedParts(input.timeZone, input.to);

    const firstMonthIndex = fromParts.year * 12 + (fromParts.month - 1) - 1;
    const lastMonthIndex = toParts.year * 12 + (toParts.month - 1) + 1;

    if (lastMonthIndex - firstMonthIndex > MAX_SCANNED_MONTHS) {
      throw new PermanentError("Cadence evaluation window is too large", {
        months: lastMonthIndex - firstMonthIndex,
        limit: MAX_SCANNED_MONTHS,
      });
    }

    const occurrences: Date[] = [];

    for (let monthIndex = firstMonthIndex; monthIndex <= lastMonthIndex; monthIndex += 1) {
      const year = Math.floor(monthIndex / 12);
      const month = (monthIndex % 12) + 1;

      const candidateDays = this.dayWithinMonth(
        spec,
        year,
        month,
        monthIndex,
        anchorMonthIndex,
      );

      if (candidateDays === null) {
        continue;
      }

      occurrences.push(this.instantFor(input.timeZone, candidateDays, time));
    }

    return occurrences;
  }

  /**
   * Resolves the target day within one calendar month, or null when this month
   * does not participate in the cadence at all.
   */
  private dayWithinMonth(
    spec: CadenceSpec,
    year: number,
    month: number,
    monthIndex: number,
    anchorMonthIndex: number,
  ): number | null {
    if (spec.type === "ANNUAL") {
      if (month !== spec.onMonth) {
        return null;
      }

      return this.clampDayOfMonth(
        year,
        month,
        spec.onDayOfMonth,
        spec.monthEndPolicy ?? "CLAMP_TO_LAST_DAY",
      );
    }

    if (spec.type === "QUARTERLY") {
      const monthsSinceAnchor = monthIndex - anchorMonthIndex;
      const positionInQuarter = ((monthsSinceAnchor % 3) + 3) % 3;

      if (positionInQuarter !== spec.monthOffsetInQuarter) {
        return null;
      }

      return this.clampDayOfMonth(
        year,
        month,
        spec.onDayOfMonth,
        spec.monthEndPolicy ?? "CLAMP_TO_LAST_DAY",
      );
    }

    if (spec.type !== "MONTHLY") {
      return null;
    }

    const everyNMonths = spec.everyNMonths ?? 1;
    const monthsSinceAnchor = monthIndex - anchorMonthIndex;

    if (((monthsSinceAnchor % everyNMonths) + everyNMonths) % everyNMonths !== 0) {
      return null;
    }

    if (spec.onNthWeekday !== undefined) {
      return this.nthWeekdayOfMonth(
        year,
        month,
        spec.onNthWeekday.nth,
        spec.onNthWeekday.weekday,
      );
    }

    return this.clampDayOfMonth(
      year,
      month,
      spec.onDayOfMonth ?? 1,
      spec.monthEndPolicy ?? "CLAMP_TO_LAST_DAY",
    );
  }

  private clampDayOfMonth(
    year: number,
    month: number,
    requestedDay: number,
    policy: MonthEndPolicy,
  ): number | null {
    const lastDay = daysInMonth(year, month);

    if (requestedDay <= lastDay) {
      return civilToDays(year, month, requestedDay);
    }

    if (policy === "SKIP_MONTH") {
      return null;
    }

    return civilToDays(year, month, lastDay);
  }

  private nthWeekdayOfMonth(
    year: number,
    month: number,
    nth: number,
    weekday: number,
  ): number | null {
    const firstDay = civilToDays(year, month, 1);
    const lastDay = civilToDays(year, month, daysInMonth(year, month));

    if (nth === -1) {
      const offset = (weekdayFromDays(lastDay) - weekday + 7) % 7;
      return lastDay - offset;
    }

    const offset = (weekday - weekdayFromDays(firstDay) + 7) % 7;
    const candidate = firstDay + offset + (nth - 1) * 7;

    return candidate > lastDay ? null : candidate;
  }

  /**
   * Cron is evaluated by stepping minute by minute over the window and testing
   * each instant's wall clock. Windows here are short (a lookahead, or a
   * bounded catch-up), so this is cheap, and it stays correct across DST
   * without any special casing.
   */
  private generateCron(input: CadenceEvaluationInput, expression: string): Date[] {
    const fields = expression.trim().split(/\s+/);
    const [minuteField, hourField, dayOfMonthField, monthField, dayOfWeekField] = fields;

    const minutes = parseCronField(minuteField, 0, 59, "minute");
    const hours = parseCronField(hourField, 0, 23, "hour");
    const daysOfMonth = parseCronField(dayOfMonthField, 1, 31, "day-of-month");
    const months = parseCronField(monthField, 1, 12, "month");
    const daysOfWeek = parseCronField(dayOfWeekField, 0, 7, "day-of-week", (value) =>
      value === 7 ? 0 : value,
    );

    const start = Math.ceil(input.from.getTime() / MINUTE_MS) * MINUTE_MS;
    const steps = Math.ceil((input.to.getTime() - start) / MINUTE_MS);

    if (steps > MAX_SCANNED_CRON_MINUTES) {
      throw new PermanentError("Cron evaluation window is too large", {
        minutes: steps,
        limit: MAX_SCANNED_CRON_MINUTES,
      });
    }

    const occurrences: Date[] = [];

    for (let step = 0; step < steps; step += 1) {
      const candidate = new Date(start + step * MINUTE_MS);
      const parts = toZonedParts(input.timeZone, candidate);

      if (!matches(minutes, parts.minute) || !matches(hours, parts.hour)) {
        continue;
      }

      if (!matches(months, parts.month)) {
        continue;
      }

      const days = civilToDays(parts.year, parts.month, parts.day);
      const dayOfMonthMatches = matches(daysOfMonth, parts.day);
      const dayOfWeekMatches = matches(daysOfWeek, weekdayFromDays(days));

      // Vixie cron semantics: when both day fields are restricted the day
      // matches if *either* does, not both.
      const dayMatches =
        daysOfMonth === null || daysOfWeek === null
          ? dayOfMonthMatches && dayOfWeekMatches
          : dayOfMonthMatches || dayOfWeekMatches;

      if (!dayMatches) {
        continue;
      }

      occurrences.push(candidate);

      if (occurrences.length > input.maxOccurrences) {
        break;
      }
    }

    return occurrences;
  }

  /**
   * Walks calendar days in the target timezone. Day stepping happens on
   * integer day numbers, never by adding 86 400 000 ms, so a DST day is still
   * exactly one day.
   */
  private scanDays(
    input: CadenceEvaluationInput,
    resolve: (days: number) => Date | null,
  ): Date[] {
    const fromParts = toZonedParts(input.timeZone, input.from);
    const toParts = toZonedParts(input.timeZone, input.to);

    // One day of slack on each side: an offset change can pull a wall-clock
    // reading from the neighbouring local day into the window.
    const firstDay = civilToDays(fromParts.year, fromParts.month, fromParts.day) - 1;
    const lastDay = civilToDays(toParts.year, toParts.month, toParts.day) + 1;

    if (lastDay - firstDay > MAX_SCANNED_DAYS) {
      throw new PermanentError("Cadence evaluation window is too large", {
        days: lastDay - firstDay,
        limit: MAX_SCANNED_DAYS,
      });
    }

    const occurrences: Date[] = [];

    for (let days = firstDay; days <= lastDay; days += 1) {
      const occurrence = resolve(days);

      if (occurrence !== null) {
        occurrences.push(occurrence);
      }
    }

    return occurrences;
  }

  private instantFor(timeZone: string, days: number, time: TimeOfDay): Date {
    const civil = daysToCivil(days);

    return fromZonedParts(timeZone, {
      year: civil.year,
      month: civil.month,
      day: civil.day,
      hour: time.hour,
      minute: time.minute,
      second: time.second,
    });
  }
}

/** `null` represents `*` — an unrestricted field. */
function parseCronField(
  field: string,
  min: number,
  max: number,
  fieldName: string,
  normalize: (value: number) => number = (value) => value,
): Set<number> | null {
  if (field === "*") {
    return null;
  }

  const values = new Set<number>();

  for (const part of field.split(",")) {
    const [range, stepText] = part.split("/");
    const step = stepText === undefined ? 1 : Number.parseInt(stepText, 10);

    if (!Number.isInteger(step) || step < 1) {
      throw new PermanentError(`Invalid step in cron ${fieldName} field`, {
        field,
      });
    }

    let rangeStart: number;
    let rangeEnd: number;

    if (range === "*") {
      rangeStart = min;
      rangeEnd = max;
    } else if (range.includes("-")) {
      const [startText, endText] = range.split("-");
      rangeStart = Number.parseInt(startText, 10);
      rangeEnd = Number.parseInt(endText, 10);
    } else {
      rangeStart = Number.parseInt(range, 10);
      rangeEnd = rangeStart;
    }

    if (
      !Number.isInteger(rangeStart) ||
      !Number.isInteger(rangeEnd) ||
      rangeStart < min ||
      rangeEnd > max ||
      rangeEnd < rangeStart
    ) {
      throw new PermanentError(`Invalid range in cron ${fieldName} field`, {
        field,
      });
    }

    for (let value = rangeStart; value <= rangeEnd; value += step) {
      values.add(normalize(value));
    }
  }

  return values;
}

function matches(allowed: Set<number> | null, value: number): boolean {
  return allowed === null || allowed.has(value);
}
