export class ScheduleEventPayload {
  constructor(
    public readonly instanceId: string,
    public readonly cadenceDefinitionId: string,
    public readonly periodRef: string,
    public readonly eventTime: Date,
  ) {}
}

export class ScheduleWindowOpenedEvent extends ScheduleEventPayload {}
export class ScheduleWindowClosingEvent extends ScheduleEventPayload {}
export class ScheduleWindowClosedEvent extends ScheduleEventPayload {}
export class ScheduleReviewDueEvent extends ScheduleEventPayload {}

export const SCHEDULE_EVENTS = {
  WINDOW_OPENED: 'schedule.window.opened',
  WINDOW_CLOSING: 'schedule.window.closing',
  WINDOW_CLOSED: 'schedule.window.closed',
  REVIEW_DUE: 'schedule.review.due',
} as const;
