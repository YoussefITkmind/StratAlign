import type { Prisma } from "../../generated/prisma/client";
import type { Logger } from "../../logging/logger";
import type {
  DomainEventEnvelope,
  EventSubscriber,
} from "../../events/event.types";
import type { JournalService } from "./journal.service";
import {
  classifyAuditEvent,
} from "./event-classification";
import type { SiemForwarder } from "./siem-forwarder";

function stringField(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];

  return typeof value === "string" && value.length > 0
    ? value
    : null;
}

export class AuditEventSubscriber implements EventSubscriber {
  readonly id = "audit.journal";

  // Wildcard subscription means every generic domain event is journaled.
  readonly eventTypes = ["*"] as const;

  constructor(
    private readonly journal: JournalService,
    private readonly siemForwarder: SiemForwarder,
    private readonly logger: Logger,
  ) {}

  async handle(
    event: DomainEventEnvelope,
  ): Promise<void> {
    const actorUserId =
      stringField(event.payload, "actorUserId") ??
      stringField(event.payload, "actor_user_id");

    const correlationId =
      stringField(event.payload, "correlationId") ??
      stringField(event.payload, "correlation_id");

    const classification = classifyAuditEvent(event);

    await this.journal.append({
      sourceEventId: event.eventId,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload as Prisma.InputJsonValue,
      actorUserId,
      correlationId,
      occurredAt: new Date(event.occurredAt),
    });

    if (classification === "security") {
      try {
        await this.siemForwarder.forward(
          event,
          classification,
        );
      } catch (error: unknown) {
        this.logger.warn("SIEM forwarding failed", {
          eventId: event.eventId,
          eventType: event.eventType,
          errorMessage:
            error instanceof Error
              ? error.message
              : String(error),
        });
      }
    }

    this.logger.debug("Journal entry appended", {
      eventId: event.eventId,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      classification,
    });
  }
}
