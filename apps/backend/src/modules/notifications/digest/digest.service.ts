import type { PrismaService } from "../../../database/prisma.service";
import type { Logger } from "../../../logging/logger";
import type { QueueService } from "../../../queue/queue.service";
import { JOB_NAMES, QUEUE_NAMES, buildJobId } from "../../../queue/queue.constants";
import { isUniqueConstraintViolation } from "../../../errors/app.errors";
import type { Prisma } from "../../../generated/prisma/client";
import {
  NotificationChannel,
  NotificationDeliveryMode,
  NotificationDeliveryStatus,
  NotificationDigestStatus,
  NotificationPriority,
} from "../../../generated/prisma/enums";
import type { NotificationPreferenceService } from "../notification.preference.service";
import type { NotificationTemplateService } from "../template/template.service";

export const DIGEST_SUMMARY_TEMPLATE_KEY = "notification.digest.summary";

export interface DigestServiceConfig {
  enabled: boolean;
  maxItems: number;
  maxAttempts: number;
}

export interface DigestSweepResult {
  groupsExamined: number;
  digestsCreated: number;
  itemsMerged: number;
}

interface DeferredGroup {
  recipientUserId: string;
  channel: NotificationChannel;
}

/**
 * Batches deferred notifications into one summary per recipient per channel.
 *
 * The interval is per-recipient (`NotificationPreference.digestIntervalMinutes`)
 * rather than a single global schedule, so a sweep — not a cadence — drives
 * it. Modelling per-recipient intervals as cadence definitions would mean one
 * definition row per recipient per channel, which is a lot of scheduler state
 * to maintain for what is a simple "has this recipient waited long enough?"
 * question. The sweep is bounded and idempotent, which is what actually
 * matters here.
 */
export class DigestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preferenceService: NotificationPreferenceService,
    private readonly templateService: NotificationTemplateService,
    private readonly queueService: QueueService,
    private readonly config: DigestServiceConfig,
    private readonly logger: Logger,
  ) {}

  async sweep(now = new Date()): Promise<DigestSweepResult> {
    if (!this.config.enabled) {
      return { groupsExamined: 0, digestsCreated: 0, itemsMerged: 0 };
    }

    const groups = await this.findDeferredGroups();

    let digestsCreated = 0;
    let itemsMerged = 0;

    for (const group of groups) {
      const result = await this.buildDigestIfDue(group, now);

      if (result !== null) {
        digestsCreated += 1;
        itemsMerged += result.itemCount;
      }
    }

    this.logger.debug("Digest sweep complete", {
      groupsExamined: groups.length,
      digestsCreated,
      itemsMerged,
    });

    return { groupsExamined: groups.length, digestsCreated, itemsMerged };
  }

  private async findDeferredGroups(): Promise<DeferredGroup[]> {
    const grouped = await this.prisma.notificationDelivery.groupBy({
      by: ["recipientUserId", "channel"],
      where: { status: NotificationDeliveryStatus.DEFERRED },
    });

    return grouped.map((row) => ({
      recipientUserId: row.recipientUserId,
      channel: row.channel,
    }));
  }

  private async buildDigestIfDue(
    group: DeferredGroup,
    now: Date,
  ): Promise<{ itemCount: number } | null> {
    const preference = await this.preferenceService.resolve(
      group.recipientUserId,
      group.channel,
    );

    const items = await this.prisma.notificationDelivery.findMany({
      where: {
        recipientUserId: group.recipientUserId,
        channel: group.channel,
        status: NotificationDeliveryStatus.DEFERRED,
      },
      orderBy: { createdAt: "asc" },
      take: this.config.maxItems,
    });

    if (items.length === 0) {
      return null;
    }

    const windowStartsAt = items[0].createdAt;
    const dueAt = new Date(
      windowStartsAt.getTime() + preference.digestIntervalMinutes * 60 * 1000,
    );

    if (now.getTime() < dueAt.getTime()) {
      // The oldest item has not waited a full interval yet.
      return null;
    }

    const localeCandidates = this.templateService.buildLocaleCandidates(
      preference.locale,
    );

    // The renderer has no loop syntax by design, so the item list is
    // pre-formatted into a single value here.
    const renderedItems = items.map(
      (item) => `• ${item.subject ?? item.templateKey}`,
    );

    const rendered = await this.templateService.render(
      DIGEST_SUMMARY_TEMPLATE_KEY,
      group.channel,
      localeCandidates,
      {
        count: items.length,
        items: renderedItems,
        windowStartsAt: windowStartsAt.toISOString(),
        windowEndsAt: now.toISOString(),
      },
    );

    let summaryDeliveryId: string | null = null;

    try {
      const outcome = await this.prisma.$transaction(async (tx) => {
        const digest = await tx.notificationDigest.create({
          data: {
            recipientUserId: group.recipientUserId,
            channel: group.channel,
            windowStartsAt,
            windowEndsAt: now,
            status: NotificationDigestStatus.OPEN,
            itemCount: items.length,
          },
        });

        const summary = await tx.notificationDelivery.create({
          data: {
            recipientUserId: group.recipientUserId,
            recipientAddress: preference.address,
            channel: group.channel,
            templateKey: DIGEST_SUMMARY_TEMPLATE_KEY,
            templateData: {
              count: items.length,
              items: renderedItems,
            } as Prisma.InputJsonValue,
            locale: localeCandidates[0],
            resolvedLocale: rendered.locale,
            subject: rendered.subject,
            body: rendered.body,
            priority: NotificationPriority.NORMAL,
            deliveryMode: NotificationDeliveryMode.IMMEDIATE,
            status: NotificationDeliveryStatus.PENDING,
            dedupeKey: `digest:${digest.id}`,
            isDigestSummary: true,
            digestId: digest.id,
            maxAttempts: this.config.maxAttempts,
          },
          select: { id: true },
        });

        // Items are closed out as DIGESTED, never SENT: they were rolled up,
        // not individually delivered, and the distinction matters when
        // auditing what a recipient actually received.
        await tx.notificationDelivery.updateMany({
          where: {
            id: { in: items.map((item) => item.id) },
            status: NotificationDeliveryStatus.DEFERRED,
          },
          data: {
            status: NotificationDeliveryStatus.DIGESTED,
            digestId: digest.id,
          },
        });

        summaryDeliveryId = summary.id;

        this.logger.info("Digest created", {
          digestId: digest.id,
          recipientUserId: group.recipientUserId,
          channel: group.channel,
          itemCount: items.length,
        });

        return { itemCount: items.length };
      });

      // Enqueued only after the transaction commits. Enqueuing inside it would
      // leave a job pointing at a delivery that never existed if the
      // transaction rolled back afterwards.
      if (summaryDeliveryId !== null) {
        await this.queueService.enqueue(
          QUEUE_NAMES.notificationDelivery,
          JOB_NAMES.deliverNotification,
          { deliveryId: summaryDeliveryId },
          { jobId: buildJobId("delivery", summaryDeliveryId) },
        );
      }

      return outcome;
    } catch (error: unknown) {
      if (isUniqueConstraintViolation(error)) {
        // A concurrent sweep already built this window. The unique index on
        // (recipient, channel, windowStartsAt) is what makes that safe.
        this.logger.debug("Digest for this window already exists", {
          recipientUserId: group.recipientUserId,
          channel: group.channel,
        });

        return null;
      }

      throw error;
    }
  }
}
