import type { DomainEventEnvelope, EventSubscriber } from "../../events/event.types";
import { SCHEDULE_EVENT_TYPES } from "../scheduler/scheduler.events";
import type { ValueService } from "./value.service";

/**
 * Domain reaction to the generic scheduler. The scheduler stays unaware of
 * Value Management: this subscriber opts into reviewDue events whose opaque
 * subjectType is `value_checkin` and asks ValueService to raise governance
 * escalations for due, incomplete check-ins.
 */
export class ValueCheckinDueSubscriber implements EventSubscriber {
  readonly id = "value.checkin-due";
  readonly eventTypes = [SCHEDULE_EVENT_TYPES.reviewDue];

  constructor(private readonly value: ValueService) {}

  async handle(envelope: DomainEventEnvelope): Promise<void> {
    const payload = envelope.payload as Record<string, unknown>;
    if (payload.subjectType !== "value_checkin") return;

    const reviewDueAt = typeof payload.reviewDueAt === "string"
      ? new Date(payload.reviewDueAt)
      : new Date();
    // The sweep uses a strict overdue comparison; one millisecond makes a
    // reviewDue event represent the first instant after its deadline.
    const overdueAt = new Date(reviewDueAt.getTime() + 1);
    await this.value.escalateOverdueCheckins(overdueAt);
  }
}
