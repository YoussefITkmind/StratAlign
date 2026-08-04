import { Injectable } from '@nestjs/common';
import { CadenceDefinition, PeriodCalendar, CadenceType } from '@prisma/client';

export interface GeneratedPeriod {
  periodRef: string;
  periodStart: Date;
  periodEnd: Date;
  openedAt: Date;
  dueAt: Date;
  closingAt: Date;
  closedAt: Date;
}

@Injectable()
export class CadenceGeneratorService {
  /**
   * Partitions the PeriodCalendar into periods and calculates scheduling dates.
   */
  generatePeriods(
    definition: CadenceDefinition,
    calendar: PeriodCalendar,
    horizonMonths: number,
  ): GeneratedPeriod[] {
    const periods: GeneratedPeriod[] = [];
    const calendarStart = new Date(calendar.startDate);
    const calendarEnd = new Date(calendar.endDate);

    if (definition.cadenceType === CadenceType.MONTHLY) {
      // Monthly partitions (max 12 or horizonMonths)
      const count = Math.min(12, horizonMonths);
      for (let i = 0; i < count; i++) {
        const periodStart = this.addMonths(calendarStart, i);
        if (periodStart >= calendarEnd) break;

        // Month end is the day before the start of the next month
        const nextMonthStart = this.addMonths(calendarStart, i + 1);
        const periodEnd = this.addDays(nextMonthStart, -1);

        // Ensure periodEnd doesn't exceed calendarEnd
        const finalPeriodEnd =
          periodEnd > calendarEnd ? calendarEnd : periodEnd;

        const monthNum = periodStart.getUTCMonth() + 1;
        const monthStr = monthNum < 10 ? `0${monthNum}` : `${monthNum}`;
        const periodRef = `${calendar.fiscalYear}-${monthStr}`;

        periods.push(
          this.calculateDates(
            definition,
            periodStart,
            finalPeriodEnd,
            periodRef,
          ),
        );
      }
    } else if (definition.cadenceType === CadenceType.QUARTERLY) {
      // Quarterly partitions (max 4 or horizonMonths / 3)
      const count = Math.min(4, Math.ceil(horizonMonths / 3));
      for (let i = 0; i < count; i++) {
        const periodStart = this.addMonths(calendarStart, i * 3);
        if (periodStart >= calendarEnd) break;

        const nextQuarterStart = this.addMonths(calendarStart, (i + 1) * 3);
        const periodEnd = this.addDays(nextQuarterStart, -1);
        const finalPeriodEnd =
          periodEnd > calendarEnd ? calendarEnd : periodEnd;

        const periodRef = `${calendar.fiscalYear}-Q${i + 1}`;

        periods.push(
          this.calculateDates(
            definition,
            periodStart,
            finalPeriodEnd,
            periodRef,
          ),
        );
      }
    } else if (definition.cadenceType === CadenceType.ADHOC) {
      // Adhoc is a single period spanning the entire calendar
      const periodRef = `${calendar.fiscalYear}-ADHOC`;
      periods.push(
        this.calculateDates(definition, calendarStart, calendarEnd, periodRef),
      );
    }

    return periods;
  }

  private calculateDates(
    definition: CadenceDefinition,
    periodStart: Date,
    periodEnd: Date,
    periodRef: string,
  ): GeneratedPeriod {
    // dueAt = periodStart + dayOffset days
    let dueAt = this.addDays(periodStart, definition.dayOffset);
    if (dueAt > periodEnd) {
      dueAt = new Date(periodEnd);
    }

    // openedAt = dueAt - warningLeadDays
    let openedAt = this.addDays(dueAt, -definition.warningLeadDays);
    if (openedAt < periodStart) {
      openedAt = new Date(periodStart);
    }

    // closingAt = dueAt + 1 day
    let closingAt = this.addDays(dueAt, 1);
    if (closingAt > periodEnd) {
      closingAt = new Date(periodEnd);
    }

    // closedAt = dueAt + 2 days
    let closedAt = this.addDays(dueAt, 2);
    if (closedAt > periodEnd) {
      closedAt = new Date(periodEnd);
    }

    return {
      periodRef,
      periodStart,
      periodEnd,
      openedAt,
      dueAt,
      closingAt,
      closedAt,
    };
  }

  private addMonths(date: Date, months: number): Date {
    const d = new Date(date.getTime());
    d.setUTCMonth(d.getUTCMonth() + months);
    return d;
  }

  private addDays(date: Date, days: number): Date {
    const d = new Date(date.getTime());
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  }
}
