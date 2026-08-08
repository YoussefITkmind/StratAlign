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
const MAX_SCANNED_MONTHS = 400;


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
      case "ADHOC":
        return [new Date(input.spec.runAt)];

      case "MONTHLY":
      case "QUARTERLY":
        return this.generateMonthBased(input);

      default: {
        const unreachable: never = input.spec;
        throw new PermanentError("Unsupported cadence type", {
          spec: unreachable,
        });
      }
    }
  }

  private generateMonthBased(input: CadenceEvaluationInput): Date[] {
    const spec = input.spec;

    if (spec.type !== "MONTHLY" && spec.type !== "QUARTERLY") {
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

  /**   */
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


