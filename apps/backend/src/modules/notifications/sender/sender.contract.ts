import type {
  NotificationChannel,
  NotificationPriority,
} from "../../../generated/prisma/enums";

/**
 * Everything a sender needs, already rendered. Senders never touch the
 * database, templates, preferences or the queue — they translate a finished
 * message into one provider call. That is what makes adding a channel a
 * single-file change.
 */
export interface OutboundMessage {
  deliveryId: string;
  channel: NotificationChannel;
  recipientUserId: string;
  /** Channel-specific destination: an email address, a webhook URL, ... */
  address: string | null;
  locale: string;
  subject: string;
  body: string;
  priority: NotificationPriority;
}

export interface SenderResult {
  /** Provider-side identifier, when the provider returns one. */
  providerMessageId: string | null;
}

export interface NotificationSender {
  readonly channel: NotificationChannel;
  /**
   * Throws `TransientError` for conditions worth retrying (timeouts, 5xx,
   * rate limits) and `PermanentError` for those that are not (malformed
   * address, rejected payload, missing configuration).
   */
  send(message: OutboundMessage): Promise<SenderResult>;
}
