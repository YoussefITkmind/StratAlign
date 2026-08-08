import type { Prisma } from "../generated/prisma/client";
import type { Logger } from "../logging/logger";
import type { QueueService } from "../queue/queue.service";
import { JOB_NAMES, QUEUE_NAMES } from "../queue/queue.constants";
import type { EventPublicationRequest } from "./event.types";

/**
 * Transactional outbox writer.
 *
 * Events are inserted in the same transaction as the state change that caused
 * them. Enqueuing to Redis directly from a producer would leave a window where
 * the database commits and the enqueue fails (losing the event) or the enqueue
 * succeeds and the transaction rolls back (a phantom event). Writing to the
 * outbox makes the state change and its announcement atomic; the relay then
 * takes responsibility for at-least-once delivery.
 */
export class EventBusService {
  constructor(
    private readonly queueService: QueueService,
    private readonly logger: Logger,
  ) {}

  /**
   * Must be called with a transaction client, from inside the transaction that
   * performs the corresponding state change.
   *
   * `skipDuplicates` makes a replayed producer a no-op rather than a crash:
   * the dedupe key is the contract that the same logical event is only ever
   * announced once.
   */
  async publishWithin(
    tx: Prisma.TransactionClient,
    requests: readonly EventPublicationRequest[],
  ): Promise<number> {
    if (requests.length === 0) {
      return 0;
    }

    const result = await tx.domainEvent.createMany({
      data: requests.map((request) => ({
        eventType: request.eventType,
        eventVersion: request.eventVersion,
        aggregateType: request.aggregateType,
        aggregateId: request.aggregateId,
        dedupeKey: request.dedupeKey,
        occurredAt: request.occurredAt ?? new Date(),
        payload: request.payload as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });

    return result.count;
  }

  /**
   * Best-effort latency optimisation: asks the relay to sweep now rather than
   * waiting for its next interval. Failure is not propagated, because the
   * periodic sweep will pick the events up regardless — the outbox is what
   * guarantees delivery, not this nudge.
   */
  async nudgeRelay(): Promise<void> {
    try {
      await this.queueService.enqueue(
        QUEUE_NAMES.eventsRelay,
        JOB_NAMES.relayOutbox,
        {},
      );
    } catch (error: unknown) {
      this.logger.warn("Failed to nudge the outbox relay; the periodic sweep will cover it", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
