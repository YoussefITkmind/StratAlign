/**
 * Cadence vocabulary. Every option here is a *shape of time* — none of it
 * describes what is being scheduled. That separation is what lets the
 * scheduler serve KPI collection, OKR check-ins or anything else without
 * knowing they exist.
 */

/** 0 = Sunday through 6 = Saturday, matching `Date#getDay`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** What to do when a target day-of-month does not exist in a short month. */
export type MonthEndPolicy = "CLAMP_TO_LAST_DAY" | "SKIP_MONTH";

export interface OnceCadence {
  type: "ONCE";
  /** ISO-8601 instant. */
  runAt: string;
}

export interface IntervalCadence {
  type: "INTERVAL";
  everySeconds: number;
}

export interface DailyCadence {
  type: "DAILY";
  /** "HH:mm" or "HH:mm:ss" wall clock, in the definition's timezone. */
  atTime: string;
  onWeekdays?: Weekday[];
}

export interface WeeklyCadence {
  type: "WEEKLY";
  atTime: string;
  onWeekdays: Weekday[];
  everyNWeeks?: number;
}

export interface MonthlyCadence {
  type: "MONTHLY";
  atTime: string;
  onDayOfMonth?: number;
  /** Alternative to `onDayOfMonth`: "the 3rd Tuesday", `nth: -1` = last. */
  onNthWeekday?: { nth: number; weekday: Weekday };
  everyNMonths?: number;
  monthEndPolicy?: MonthEndPolicy;
}

export interface QuarterlyCadence {
  type: "QUARTERLY";
  atTime: string;
  /** 0, 1 or 2 — which month within the quarter fires. */
  monthOffsetInQuarter: number;
  onDayOfMonth: number;
  monthEndPolicy?: MonthEndPolicy;
}

export interface AnnualCadence {
  type: "ANNUAL";
  atTime: string;
  /** 1-12. */
  onMonth: number;
  onDayOfMonth: number;
  monthEndPolicy?: MonthEndPolicy;
}

export interface CronCadence {
  type: "CRON";
  /** Standard 5-field expression: minute hour day-of-month month day-of-week. */
  expression: string;
}

export type CadenceSpec =
  | OnceCadence
  | IntervalCadence
  | DailyCadence
  | WeeklyCadence
  | MonthlyCadence
  | QuarterlyCadence
  | AnnualCadence
  | CronCadence;

export interface CadenceEvaluationInput {
  spec: CadenceSpec;
  timeZone: string;
  /** Phase origin. Governs `everyNWeeks`/`everyNMonths` and INTERVAL stepping. */
  anchorAt: Date;
  /** Half-open window: occurrences in [from, to) are returned. */
  from: Date;
  to: Date;
  maxOccurrences: number;
}

export interface TimeOfDay {
  hour: number;
  minute: number;
  second: number;
}
