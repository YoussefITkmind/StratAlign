import type { PrismaService } from "../../database/prisma.service";
import type { Logger } from "../../logging/logger";
import type { QueueService } from "../../queue/queue.service";
import { JOB_NAMES, QUEUE_NAMES, buildJobId } from "../../queue/queue.constants";
import { isUniqueConstraintViolation } from "../../errors/app.errors";
import type { Prisma } from "../../generated/prisma/client";
import {
  NotificationChannel,
  NotificationDeliveryMode,
  NotificationDeliveryStatus,
  NotificationPriority,
} from "../../generated/prisma/enums";
import type { NotificationPreferenceService } from "./notification.preference.service";
import type { NotificationTemplateService } from "./template/template.service";
import type { TemplateData } from "./template/template.renderer";

export interface NotificationRequest {
  recipientUserId: string;
  channel: NotificationChannel;
  templateKey: string;
  data?: TemplateData;
  /** Overrides the recipient's preferred locale when supplied. */
  locale?: string;
  /** Overrides the address stored on the preference row. */
  address?: string;
  priority?: NotificationPriority;
  /** Required. Makes a replayed request a no-op rather than a second message. */
  dedupeKey: string;
  sourceEventId?: string;
}

export interface NotificationRequestResult {
  deliveryId: string;
  status: NotificationDeliveryStatus;
  /** True when an existing delivery with the same dedupe key was found. */
  deduplicated: boolean;
}

export interface NotificationServiceConfig {
  enabled: boolean;
  maxAttempts: number;
}

/**
 * The single entry point every module uses to send something.
 *
 * Content is rendered here, at request time, rather than at delivery time.
 * That means a template error surfaces to the caller immediately instead of
 * hours later inside a worker, the digest can summarise deferred items by
 * their real subject lines, and an edited template can never retroactively
 * change a message that was already queued.
 */
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preferenceService: NotificationPreferenceService,
    private readonly templateService: NotificationTemplateService,
    private readonly queueService: QueueService,
    private readonly config: NotificationServiceConfig,
    private readonly logger: Logger,
  ) {}

  async request(input: NotificationRequest): Promise<NotificationRequestResult> {
    const existing = await this.prisma.notificationDelivery.findUnique({
      where: { dedupeKey: input.dedupeKey },
      select: { id: true, status: true },
    });

    if (existing) {
      return {
        deliveryId: existing.id,
        status: existing.status,
        deduplicated: true,
      };
    }

    const preference = await this.preferenceService.resolve(
      input.recipientUserId,
      input.channel,
    );

    const priority = input.priority ?? NotificationPriority.NORMAL;
    const isUrgent = priority === NotificationPriority.URGENT;

    const suppressionReason = this.suppressionReasonFor(input, preference.isEnabled, [
      ...preference.mutedTemplateKeys,
    ]);

    if (suppressionReason !== null) {
      return this.persist(input, {
        status: NotificationDeliveryStatus.SUPPRESSED,
        deliveryMode: NotificationDeliveryMode.IMMEDIATE,
        locale: input.locale ?? preference.locale,
        resolvedLocale: null,
        subject: null,
        body: null,
        address: input.address ?? preference.address,
        priority,
        availableAt: new Date(),
        enqueue: false,
        suppressionReason,
      });
    }

    const localeCandidates = this.templateService.buildLocaleCandidates(
      input.locale,
      preference.locale,
    );

    const rendered = await this.templateService.render(
      input.templateKey,
      input.channel,
      localeCandidates,
      input.data ?? {},
    );

    // Urgent messages never wait in a digest — an escalation batched into a
    // daily summary has failed at its only job.
    const deliveryMode =
      preference.deliveryMode === NotificationDeliveryMode.DIGEST && !isUrgent
        ? NotificationDeliveryMode.DIGEST
        : NotificationDeliveryMode.IMMEDIATE;

    const isDeferred = deliveryMode === NotificationDeliveryMode.DIGEST;

    return this.persist(input, {
      status: isDeferred
        ? NotificationDeliveryStatus.DEFERRED
        : NotificationDeliveryStatus.PENDING,
      deliveryMode,
      locale: localeCandidates[0],
      resolvedLocale: rendered.locale,
      subject: rendered.subject,
      body: rendered.body,
      address: input.address ?? preference.address,
      priority,
      availableAt: new Date(),
      // Deferred rows are picked up by the digest sweep, not the delivery
      // queue, so nothing is enqueued for them here.
      enqueue: !isDeferred,
      suppressionReason: null,
    });
  }

  private suppressionReasonFor(
    input: NotificationRequest,
    isEnabled: boolean,
    mutedTemplateKeys: readonly string[],
  ): string | null {
    if (!this.config.enabled) {
      return "Notifications are disabled by configuration";
    }

    if (!isEnabled) {
      return "Recipient has disabled this channel";
    }

    if (mutedTemplateKeys.includes(input.templateKey)) {
      return "Recipient has muted this notification type";
    }

    return null;
  }

  private async persist(
    input: NotificationRequest,
    resolved: {
      status: NotificationDeliveryStatus;
      deliveryMode: NotificationDeliveryMode;
      locale: string;
      resolvedLocale: string | null;
      subject: string | null;
      body: string | null;
      address: string | null;
      priority: NotificationPriority;
      availableAt: Date;
      enqueue: boolean;
      suppressionReason: string | null;
    },
  ): Promise<NotificationRequestResult> {
    let delivery: { id: string; status: NotificationDeliveryStatus };

    try {
      delivery = await this.prisma.notificationDelivery.create({
        data: {
          recipientUserId: input.recipientUserId,
          recipientAddress: resolved.address,
          channel: input.channel,
          templateKey: input.templateKey,
          templateData: (input.data ?? {}) as Prisma.InputJsonValue,
          locale: resolved.locale,
          resolvedLocale: resolved.resolvedLocale,
          subject: resolved.subject,
          body: resolved.body,
          priority: resolved.priority,
          deliveryMode: resolved.deliveryMode,
          status: resolved.status,
          dedupeKey: input.dedupeKey,
          availableAt: resolved.availableAt,
          sourceEventId: input.sourceEventId,
          maxAttempts: this.config.maxAttempts,
          lastError: resolved.suppressionReason,
        },
        select: { id: true, status: true },
      });
    } catch (error: unknown) {
      if (isUniqueConstraintViolation(error)) {
        // Another caller won the race on the same dedupe key. That is the
        // constraint doing its job, not a failure.
        const winner = await this.prisma.notificationDelivery.findUniqueOrThrow({
          where: { dedupeKey: input.dedupeKey },
          select: { id: true, status: true },
        });

        return {
          deliveryId: winner.id,
          status: winner.status,
          deduplicated: true,
        };
      }

      throw error;
    }

    if (resolved.enqueue) {
      await this.queueService.enqueue(
        QUEUE_NAMES.notificationDelivery,
        JOB_NAMES.deliverNotification,
        { deliveryId: delivery.id },
        { jobId: buildJobId("delivery", delivery.id) },
      );
    }

    this.logger.info("Notification delivery created", {
      deliveryId: delivery.id,
      recipientUserId: input.recipientUserId,
      channel: input.channel,
      templateKey: input.templateKey,
      status: resolved.status,
      deliveryMode: resolved.deliveryMode,
      resolvedLocale: resolved.resolvedLocale,
    });

    return {
      deliveryId: delivery.id,
      status: delivery.status,
      deduplicated: false,
    };
  }
}
