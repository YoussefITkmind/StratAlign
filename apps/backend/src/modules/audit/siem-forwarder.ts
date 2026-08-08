import type { DomainEventEnvelope } from "../../events/event.types";
import type { Logger } from "../../logging/logger";
import type { AuditEventClassification } from "./event-classification";

export interface SiemForwarder {
  forward(
    event: DomainEventEnvelope,
    classification: AuditEventClassification,
  ): Promise<void>;
}

/**
 * Phase 1 SIEM adapter.
 *
 * No external SIEM network call is made yet. Security events are routed
 * through this adapter so a real SIEM transport can replace it later
 * without changing the audit subscriber.
 */
export class StubSiemForwarder implements SiemForwarder {
  constructor(
    private readonly logger: Logger,
  ) {}

  async forward(
    event: DomainEventEnvelope,
    classification: AuditEventClassification,
  ): Promise<void> {
    this.logger.info("SIEM forwarding stub received event", {
      eventId: event.eventId,
      eventType: event.eventType,
      classification,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
    });
  }
}
