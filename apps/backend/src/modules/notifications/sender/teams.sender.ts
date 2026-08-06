import { PermanentError } from "../../../errors/app.errors";
import { NotificationChannel } from "../../../generated/prisma/enums";
import type { Logger } from "../../../logging/logger";
import type {
  NotificationSender,
  OutboundMessage,
  SenderResult,
} from "./sender.contract";
import { postJson } from "./http-transport";

export interface TeamsSenderConfig {
  /** Fallback webhook, used when a recipient has no channel address. */
  defaultWebhookUrl: string | null;
  timeoutMs: number;
}

/**
 * Posts to a Microsoft Teams incoming webhook.
 *
 * The address on a delivery, when present, *is* the webhook URL, so different
 * recipients can map to different channels. Teams webhooks return an empty
 * body, so there is no provider message id to record.
 */
export class TeamsSender implements NotificationSender {
  readonly channel = NotificationChannel.TEAMS;

  constructor(
    private readonly config: TeamsSenderConfig,
    private readonly logger: Logger,
  ) {}

  async send(message: OutboundMessage): Promise<SenderResult> {
    const webhookUrl = message.address ?? this.config.defaultWebhookUrl;

    if (!webhookUrl) {
      throw new PermanentError("No Teams webhook configured for recipient", {
        deliveryId: message.deliveryId,
        recipientRef: message.recipientRef,
      });
    }

    const response = await postJson({
      url: webhookUrl,
      timeoutMs: this.config.timeoutMs,
      context: { deliveryId: message.deliveryId, channel: this.channel },
      body: buildMessageCard(message),
    });

    this.logger.info("Teams message dispatched", {
      deliveryId: message.deliveryId,
      status: response.status,
    });

    return { providerMessageId: null };
  }
}

/** Urgent messages are coloured red so they stand out in a busy channel. */
const URGENT_THEME_COLOUR = "D93025";
const DEFAULT_THEME_COLOUR = "0F6CBD";

function buildMessageCard(message: OutboundMessage): Record<string, unknown> {
  return {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    summary: message.subject,
    themeColor:
      message.priority === "URGENT" ? URGENT_THEME_COLOUR : DEFAULT_THEME_COLOUR,
    title: message.subject,
    text: message.body,
  };
}
