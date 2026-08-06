import type { PrismaService } from "../../database/prisma.service";
import type { Logger } from "../../logging/logger";
import { PermanentError, isPermanentError } from "../../errors/app.errors";
import {
  NotificationDeliveryStatus,
  NotificationDigestStatus,
} from "../../generated/prisma/enums";
import type { SenderRegistry } from "./sender/sender.registry";
import type { OutboundMessage } from "./sender/sender.contract";

export interface DispatchOutcome {
  status: NotificationDeliveryStatus;
  providerMessageId: string | null;
  skipped: boolean;
}

/**
 * Sends one already-rendered delivery and records the result.
 *
 * The dispatcher does no rendering, no preference resolution and no routing
 * decisions — all of that happened when the delivery was created. Its only
 * job is: pick the sender, call it, persist what happened.
 */
export class NotificationDispatcher {
  constructor(
    private readonly prisma: PrismaService,
    private readonly senderRegistry: SenderRegistry,
    private readonly logger: Logger,
  ) {}

  async dispatch(deliveryId: string): Promise<DispatchOutcome> {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery) {
      throw new PermanentError("Notification delivery no longer exists", {
        deliveryId,
      });
    }

    if (delivery.status !== NotificationDeliveryStatus.PENDING) {
      // Already sent, suppressed, or rolled into a digest. A redelivered job
      // must not send a second copy.
      return {
        status: delivery.status,
        providerMessageId: delivery.providerMessageId,
        skipped: true,
      };
    }

    if (delivery.subject === null || delivery.body === null) {
      await this.markFailed(deliveryId, "Delivery has no rendered content");

      throw new PermanentError("Delivery has no rendered content", {
        deliveryId,
      });
    }

    const message: OutboundMessage = {
      deliveryId: delivery.id,
      channel: delivery.channel,
      recipientRef: delivery.recipientRef,
      address: delivery.recipientAddress,
      locale: delivery.resolvedLocale ?? delivery.locale,
      subject: delivery.subject,
      body: delivery.body,
      priority: delivery.priority,
    };

    const sender = this.senderRegistry.get(delivery.channel);

    try {
      const result = await sender.send(message);

      await this.markSent(delivery.id, result.providerMessageId);

      if (delivery.isDigestSummary && delivery.digestId !== null) {
        await this.markDigestSent(delivery.digestId);
      }

      return {
        status: NotificationDeliveryStatus.SENT,
        providerMessageId: result.providerMessageId,
        skipped: false,
      };
    } catch (error: unknown) {
      await this.recordAttempt(delivery.id, error);

      if (isPermanentError(error)) {
        // Nothing about a retry would change the outcome, so the record is
        // closed here and the job completes rather than burning attempts.
        await this.markFailed(
          delivery.id,
          error instanceof Error ? error.message : String(error),
        );

        this.logger.error("Notification permanently failed", error, {
          deliveryId: delivery.id,
          channel: delivery.channel,
        });

        return {
          status: NotificationDeliveryStatus.FAILED,
          providerMessageId: null,
          skipped: false,
        };
      }

      // Transient: let it propagate so BullMQ retries with backoff.
      throw error;
    }
  }

  /**
   * Called by the delivery worker once BullMQ has exhausted its attempts, so
   * the row does not sit in PENDING forever after the queue gives up.
   */
  async markExhausted(deliveryId: string, reason: string): Promise<void> {
    await this.markFailed(deliveryId, reason);
  }

  private async markSent(
    deliveryId: string,
    providerMessageId: string | null,
  ): Promise<void> {
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: NotificationDeliveryStatus.SENT,
        sentAt: new Date(),
        providerMessageId,
        lastError: null,
      },
    });
  }

  private async markFailed(deliveryId: string, reason: string): Promise<void> {
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: NotificationDeliveryStatus.FAILED,
        failedAt: new Date(),
        lastError: reason,
      },
    });
  }

  private async recordAttempt(deliveryId: string, error: unknown): Promise<void> {
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        attempts: { increment: 1 },
        lastError: error instanceof Error ? error.message : String(error),
      },
    });
  }

  private async markDigestSent(digestId: string): Promise<void> {
    await this.prisma.notificationDigest.update({
      where: { id: digestId },
      data: {
        status: NotificationDigestStatus.SENT,
        sentAt: new Date(),
      },
    });
  }
}
