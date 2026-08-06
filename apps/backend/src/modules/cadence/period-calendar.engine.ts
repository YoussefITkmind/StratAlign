import { PeriodType } from "../../generated/prisma/enums";
import {
  civilToDays,
  daysInMonth,
  daysToCivil,
  fromZonedParts,
  toZonedParts,
  weekdayFromDays,
} from "./timezone.util";

export interface PeriodCalendarDefinition {
  periodType: PeriodType;
  /** 1 = January. Shifts quarter and year boundaries for fiscal calendars. */
  fiscalYearStartMonth: number;
  timezone: string;
}

export interface ResolvedPeriod {
  /** Human-readable, stable label such as "2026-08" or "FY2026-Q3". */
  key: string;
  startsAt: Date;
  /** Exclusive: a period covers [startsAt, endsAt). */
  endsAt: Date;
}

/**
 * Resolves which labelled period an instant belongs to.
 *
 * Periods are computed, not stored. A calendar is a deterministic function of
 * (period type, fiscal start, timezone), so materialising rows for every
 * period would add a table to maintain and keep in sync for no extra
 * expressive power. Instances carry the resolved label and bounds instead.
 */
export class PeriodCalendarEngine {
  resolvePeriod(
    calendar: PeriodCalendarDefinition,
    instant: Date,
  ): ResolvedPeriod {
    switch (calendar.periodType) {
      case PeriodType.WEEK:
        return this.resolveWeek(calendar, instant);
      case PeriodType.MONTH:
        return this.resolveMonth(calendar, instant);
      case PeriodType.QUARTER:
        return this.resolveQuarter(calendar, instant);
      case PeriodType.YEAR:
        return this.resolveYear(calendar, instant);
      default:
        return this.resolveMonth(calendar, instant);
    }
  }

  /** ISO-style weeks, starting Monday. */
  private resolveWeek(
    calendar: PeriodCalendarDefinition,
    instant: Date,
  ): ResolvedPeriod {
    const parts = toZonedParts(calendar.timezone, instant);
    const days = civilToDays(parts.year, parts.month, parts.day);

    // weekdayFromDays is Sunday-based; shift so Monday starts the week.
    const mondayOffset = (weekdayFromDays(days) + 6) % 7;
    const weekStartDays = days - mondayOffset;

    const startsAt = this.startOfDay(calendar.timezone, weekStartDays);
    const endsAt = this.startOfDay(calendar.timezone, weekStartDays + 7);

    const thursdayOfWeek = daysToCivil(weekStartDays + 3);
    const isoWeek = this.isoWeekNumber(weekStartDays + 3);

    return {
      key: `${thursdayOfWeek.year}-W${String(isoWeek).padStart(2, "0")}`,
      startsAt,
      endsAt,
    };
  }

  private resolveMonth(
    calendar: PeriodCalendarDefinition,
    instant: Date,
  ): ResolvedPeriod {
    const parts = toZonedParts(calendar.timezone, instant);
    const startDays = civilToDays(parts.year, parts.month, 1);
    const endDays = startDays + daysInMonth(parts.year, parts.month);

    return {
      key: `${parts.year}-${String(parts.month).padStart(2, "0")}`,
      startsAt: this.startOfDay(calendar.timezone, startDays),
      endsAt: this.startOfDay(calendar.timezone, endDays),
    };
  }

  private resolveQuarter(
    calendar: PeriodCalendarDefinition,
    instant: Date,
  ): ResolvedPeriod {
    const parts = toZonedParts(calendar.timezone, instant);
    const { fiscalYear, monthsIntoFiscalYear } = this.fiscalPosition(
      calendar,
      parts.year,
      parts.month,
    );

    const quarterIndex = Math.floor(monthsIntoFiscalYear / 3);
    const quarterStartMonthIndex =
      fiscalYear * 12 + (calendar.fiscalYearStartMonth - 1) + quarterIndex * 3;

    const startsAt = this.startOfMonthIndex(calendar.timezone, quarterStartMonthIndex);
    const endsAt = this.startOfMonthIndex(calendar.timezone, quarterStartMonthIndex + 3);

    return {
      key: `${this.fiscalPrefix(calendar)}${fiscalYear}-Q${quarterIndex + 1}`,
      startsAt,
      endsAt,
    };
  }

  private resolveYear(
    calendar: PeriodCalendarDefinition,
    instant: Date,
  ): ResolvedPeriod {
    const parts = toZonedParts(calendar.timezone, instant);
    const { fiscalYear } = this.fiscalPosition(calendar, parts.year, parts.month);

    const startMonthIndex = fiscalYear * 12 + (calendar.fiscalYearStartMonth - 1);

    return {
      key: `${this.fiscalPrefix(calendar)}${fiscalYear}`,
      startsAt: this.startOfMonthIndex(calendar.timezone, startMonthIndex),
      endsAt: this.startOfMonthIndex(calendar.timezone, startMonthIndex + 12),
    };
  }

  /**
   * The fiscal year is labelled by the calendar year in which it *starts*.
   * Organisations differ on this, so it is stated explicitly rather than
   * inferred, and the "FY" prefix only appears on genuinely shifted calendars.
   */
  private fiscalPosition(
    calendar: PeriodCalendarDefinition,
    year: number,
    month: number,
  ): { fiscalYear: number; monthsIntoFiscalYear: number } {
    const monthIndex = year * 12 + (month - 1);
    const startOffset = calendar.fiscalYearStartMonth - 1;
    const fiscalYear = Math.floor((monthIndex - startOffset) / 12);
    const monthsIntoFiscalYear = monthIndex - (fiscalYear * 12 + startOffset);

    return { fiscalYear, monthsIntoFiscalYear };
  }

  private fiscalPrefix(calendar: PeriodCalendarDefinition): string {
    return calendar.fiscalYearStartMonth === 1 ? "" : "FY";
  }

  private startOfMonthIndex(timeZone: string, monthIndex: number): Date {
    const year = Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;

    return this.startOfDay(timeZone, civilToDays(year, month, 1));
  }

  private startOfDay(timeZone: string, days: number): Date {
    const civil = daysToCivil(days);

    return fromZonedParts(timeZone, {
      year: civil.year,
      month: civil.month,
      day: civil.day,
      hour: 0,
      minute: 0,
      second: 0,
    });
  }

  private isoWeekNumber(thursdayDays: number): number {
    const civil = daysToCivil(thursdayDays);
    const firstThursdayOfYear = this.firstThursday(civil.year);

    return Math.floor((thursdayDays - firstThursdayOfYear) / 7) + 1;
  }

  private firstThursday(year: number): number {
    const january1 = civilToDays(year, 1, 1);
    // 4 == Thursday in the Sunday-based numbering used by weekdayFromDays.
    const offset = (4 - weekdayFromDays(january1) + 7) % 7;

    return january1 + offset;
  }
}
