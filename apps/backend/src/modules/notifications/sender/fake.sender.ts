import type { NotificationChannel } from "../../../generated/prisma/enums";
import type { Logger } from "../../../logging/logger";
import type {
  NotificationSender,
  OutboundMessage,
  SenderResult,
} from "./sender.contract";

export interface RecordedMessage extends OutboundMessage {
  sentAt: Date;
}

/**
 * Records messages instead of sending them.
 *
 * This is the default in every environment (`NOTIFICATION_SENDER_MODE=fake`)
 * so that a deployment which forgets to configure a provider cannot silently
 * mail real people. It also gives tests an assertable sink without stubbing
 * the network.
 */
export class FakeSender implements NotificationSender {
  private readonly sent: RecordedMessage[] = [];

  constructor(
    readonly channel: NotificationChannel,
    private readonly logger: Logger,
  ) {}

  async send(message: OutboundMessage): Promise<SenderResult> {
    const sentAt = new Date();

    this.sent.push({ ...message, sentAt });

    this.logger.info("Fake sender captured a message", {
      deliveryId: message.deliveryId,
      channel: this.channel,
      recipientUserId: message.recipientUserId,
      subject: message.subject,
      locale: message.locale,
    });

    return {
      providerMessageId: `fake-${message.deliveryId}`,
    };
  }

  /** Messages captured so far, oldest first. */
  messages(): readonly RecordedMessage[] {
    return [...this.sent];
  }

  clear(): void {
    this.sent.length = 0;
  }
}
