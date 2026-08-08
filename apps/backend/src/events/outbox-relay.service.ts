import type { PrismaService } from "../database/prisma.service";
import type { Logger } from "../logging/logger";
import type { QueueService } from "../queue/queue.service";
import { JOB_NAMES, QUEUE_NAMES, buildJobId } from "../queue/queue.constants";
import { DomainEventStatus } from "../generated/prisma/enums";
import type { EventSubscriberRegistry } from "./event-subscriber.registry";
import type { DomainEventEnvelope, EventDispatchJobData } from "./event.types";

/**
 * Moves PENDING outbox rows onto the dispatch queue, one job per interested
 * subscriber.
 *
 * The relay runs at concurrency 1 and does not lock rows. Two replicas could
 * therefore read the same batch, but each dispatch job carries the job id
 * `${eventId}:${subscriberId}`, so BullMQ collapses the duplicate. Paying for
 * SELECT ... FOR UPDATE SKIP LOCKED — and holding a transaction open across a
 * Redis round trip — would buy nothing over that.
 */
export class OutboxRelayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly subscriberRegistry: EventSubscriberRegistry,
    private readonly batchSize: number,
    private readonly logger: Logger,
  ) {}

  async relayPendingEvents(): Promise<number> {
    const pending = await this.prisma.domainEvent.findMany({
      where: { status: DomainEventStatus.PENDING },
      orderBy: { occurredAt: "asc" },
      take: this.batchSize,
    });

    if (pending.length === 0) {
      return 0;
    }

    const publishedIds: string[] = [];

    for (const event of pending) {
      const subscribers = this.subscriberRegistry.subscribersFor(
        event.eventType,
      );

      const envelope: DomainEventEnvelope = {
        eventId: event.id,
        eventType: event.eventType,
        eventVersion: event.eventVersion,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        occurredAt: event.occurredAt.toISOString(),
        payload: (event.payload ?? {}) as Record<string, unknown>,
      };

      try {
        for (const subscriber of subscribers) {
          const jobData: EventDispatchJobData = {
            eventId: event.id,
            subscriberId: subscriber.id,
            envelope,
          };

          await this.queueService.enqueue(
            QUEUE_NAMES.eventsDispatch,
            JOB_NAMES.dispatchEvent,
            jobData,
            { jobId: buildJobId("event", event.id, subscriber.id) },
          );
        }

        publishedIds.push(event.id);
      } catch (error: unknown) {
        // Leave the row PENDING so the next sweep retries it. Any subscriber
        // jobs already enqueued for this event are deduped by job id.
        this.logger.error("Failed to relay outbox event", error, {
          eventId: event.id,
          eventType: event.eventType,
        });

        await this.recordRelayFailure(event.id, error);
      }
    }

    if (publishedIds.length > 0) {
      await this.prisma.domainEvent.updateMany({
        where: { id: { in: publishedIds } },
        data: {
          status: DomainEventStatus.PUBLISHED,
          publishedAt: new Date(),
        },
      });
    }

    this.logger.debug("Outbox relay pass complete", {
      scanned: pending.length,
      published: publishedIds.length,
    });

    return publishedIds.length;
  }

  private async recordRelayFailure(
    eventId: string,
    error: unknown,
  ): Promise<void> {
    await this.prisma.domainEvent.update({
      where: { id: eventId },
      data: {
        attempts: { increment: 1 },
        lastError: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
