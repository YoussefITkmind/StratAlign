import { z } from "zod";
import type { Logger } from "../../../logging/logger";
import type {
  DomainEventEnvelope,
  EventSubscriber,
} from "../../../events/event.types";
import { NotificationChannel, NotificationPriority } from "../../../generated/prisma/enums";
import { SCHEDULE_EVENT_TYPES } from "../../scheduler/scheduler.events";
import type { NotificationService } from "../notification.service";

/**
 * The notification contract that a cadence definition may carry inside its
 * opaque `payload`.
 *
 * This schema lives in the notification module, not the scheduler. The
 * scheduler copies `payload` through without looking at it; interpreting one
 * particular shape of it is this subscriber's business. A definition with no
 * `notification` block simply produces no notifications.
 */
const scheduleNotificationConfigSchema = z.object({
  templateKey: z.string().min(1),
  priority: z.enum(["URGENT", "NORMAL", "LOW"]).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  recipients: z
    .array(
      z.object({
        recipientUserId: z.string().min(1),
        channel: z.enum(["EMAIL", "TEAMS"]),
        address: z.string().min(1).optional(),
        locale: z.string().min(2).optional(),
      }),
    )
    .nonempty(),
});

/** Which schedule events map to which template suffix. */
const TEMPLATE_SUFFIX_BY_EVENT: Record<string, string> = {
  [SCHEDULE_EVENT_TYPES.windowOpened]: "window-opened",
  [SCHEDULE_EVENT_TYPES.windowClosing]: "window-closing",
  [SCHEDULE_EVENT_TYPES.windowClosed]: "window-closed",
  [SCHEDULE_EVENT_TYPES.reviewDue]: "review-due",
};

/**
 * Turns generic schedule events into notifications.
 *
 * This is the seam between the two halves of Track C. The scheduler knows
 * nothing about notifications; the notification module knows nothing about
 * cadences beyond the event payload it subscribes to. Everything domain-shaped
 * lives here, in one file, and deleting it would leave both modules working.
 */
export class ScheduleNotificationSubscriber implements EventSubscriber {
  readonly id = "notifications.schedule";

  readonly eventTypes = [
    SCHEDULE_EVENT_TYPES.windowOpened,
    SCHEDULE_EVENT_TYPES.windowClosing,
    SCHEDULE_EVENT_TYPES.windowClosed,
    SCHEDULE_EVENT_TYPES.reviewDue,
  ];

  constructor(
    private readonly notificationService: NotificationService,
    private readonly logger: Logger,
  ) {}

  async handle(envelope: DomainEventEnvelope): Promise<void> {
    const payload = envelope.payload as Record<string, unknown>;
    const schedulePayload = (payload.payload ?? {}) as Record<string, unknown>;

    const parsed = scheduleNotificationConfigSchema.safeParse(
      schedulePayload.notification,
    );

    if (!parsed.success) {
      // A cadence with no notification block is entirely legitimate — plenty
      // of schedules exist only to wake another module up.
      this.logger.debug("Schedule event carries no notification configuration", {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
      });

      return;
    }

    const config = parsed.data;
    const suffix = TEMPLATE_SUFFIX_BY_EVENT[envelope.eventType];
    const templateKey = `${config.templateKey}.${suffix}`;

    const templateData = {
      ...config.data,
      cadenceDefinitionKey: payload.cadenceDefinitionKey,
      subjectType: payload.subjectType,
      subjectId: payload.subjectId,
      periodKey: payload.periodKey ?? "",
      occurrenceAt: payload.occurrenceAt,
      windowOpensAt: payload.windowOpensAt,
      windowClosesAt: payload.windowClosesAt,
      reviewDueAt: payload.reviewDueAt,
      timezone: payload.timezone,
    };

    for (const recipient of config.recipients) {
      await this.notificationService.request({
        recipientUserId: recipient.recipientUserId,
        channel: recipient.channel as NotificationChannel,
        templateKey,
        data: templateData,
        locale: recipient.locale,
        address: recipient.address,
        priority: (config.priority ?? "NORMAL") as NotificationPriority,
        // Derived from the event, so a redelivered event produces the same key
        // and the notification service deduplicates it away.
        dedupeKey: `${envelope.eventId}:${recipient.recipientUserId}:${recipient.channel}`,
        sourceEventId: envelope.eventId,
      });
    }

    this.logger.info("Schedule event produced notifications", {
      eventId: envelope.eventId,
      eventType: envelope.eventType,
      templateKey,
      recipients: config.recipients.length,
    });
  }
}
