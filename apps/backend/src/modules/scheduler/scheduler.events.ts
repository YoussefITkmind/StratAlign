/**
 * The scheduler's public contract.
 *
 * Every field here describes *timing* or carries an opaque passthrough. There
 * is no KPI, OKR, performance-data or strategy concept in this payload, and
 * adding one would be the point at which the scheduler stopped being generic.
 * Consumers route on `subjectType` and interpret `payload` themselves.
 */

export const SCHEDULE_EVENT_TYPES = {
  windowOpened: "schedule.window.opened",
  windowClosing: "schedule.window.closing",
  windowClosed: "schedule.window.closed",
  reviewDue: "schedule.review.due",
} as const;

export type ScheduleEventType =
  (typeof SCHEDULE_EVENT_TYPES)[keyof typeof SCHEDULE_EVENT_TYPES];

export const SCHEDULE_EVENT_VERSION = 1;

export const SCHEDULE_AGGREGATE_TYPE = "cadence_instance";

export interface ScheduleEventPayload extends Record<string, unknown> {
  cadenceDefinitionId: string;
  cadenceDefinitionKey: string;
  cadenceInstanceId: string;
  sequence: number;

  /** Opaque routing tag and identifier, copied verbatim from the definition. */
  subjectType: string;
  subjectId: string;

  occurrenceAt: string;
  windowOpensAt: string;
  windowClosingAt: string;
  windowClosesAt: string;
  reviewDueAt: string;

  periodKey: string | null;
  periodStartsAt: string | null;
  periodEndsAt: string | null;

  timezone: string;

  /** Frozen copy of the definition payload at materialisation time. */
  payload: Record<string, unknown>;
}
