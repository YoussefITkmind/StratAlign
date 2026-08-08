import { PermanentError } from "../../../errors/app.errors";
import { NotificationChannel } from "../../../generated/prisma/enums";
import type { Logger } from "../../../logging/logger";
import type {
  NotificationSender,
  OutboundMessage,
  SenderResult,
} from "./sender.contract";
import { postJson } from "./http-transport";

export interface EmailSenderConfig {
  apiUrl: string;
  apiKey: string;
  fromAddress: string;
  timeoutMs: number;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sends through a transactional email provider's HTTP API.
 *
 * An HTTP provider is used rather than SMTP because it needs no mail client
 * dependency, and because the repository has no SMTP infrastructure to point
 * at. `EMAIL_API_URL` is provider-agnostic: any service accepting a JSON POST
 * with `{ from, to, subject, text }` works, and swapping providers is a
 * configuration change rather than a code change.
 */
export class EmailSender implements NotificationSender {
  readonly channel = NotificationChannel.EMAIL;

  constructor(
    private readonly config: EmailSenderConfig,
    private readonly logger: Logger,
  ) {}

  /**
   * Validates configuration eagerly so a misconfigured deployment fails at
   * boot rather than silently failing every message hours later.
   */
  static fromEnvironment(
    environment: {
      EMAIL_API_URL?: string;
      EMAIL_API_KEY?: string;
      EMAIL_FROM_ADDRESS?: string;
      EMAIL_TIMEOUT_MS: number;
    },
    logger: Logger,
  ): EmailSender {
    const missing = [
      environment.EMAIL_API_URL ? null : "EMAIL_API_URL",
      environment.EMAIL_API_KEY ? null : "EMAIL_API_KEY",
      environment.EMAIL_FROM_ADDRESS ? null : "EMAIL_FROM_ADDRESS",
    ].filter((name): name is string => name !== null);

    if (missing.length > 0) {
      throw new Error(
        `Email delivery is enabled but ${missing.join(", ")} ${
          missing.length === 1 ? "is" : "are"
        } not configured`,
      );
    }

    return new EmailSender(
      {
        apiUrl: environment.EMAIL_API_URL as string,
        apiKey: environment.EMAIL_API_KEY as string,
        fromAddress: environment.EMAIL_FROM_ADDRESS as string,
        timeoutMs: environment.EMAIL_TIMEOUT_MS,
      },
      logger,
    );
  }

  async send(message: OutboundMessage): Promise<SenderResult> {
    const recipient = message.address;

    if (!recipient || !EMAIL_PATTERN.test(recipient)) {
      throw new PermanentError("Recipient has no usable email address", {
        deliveryId: message.deliveryId,
        recipientUserId: message.recipientUserId,
      });
    }

    const response = await postJson({
      url: this.config.apiUrl,
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      timeoutMs: this.config.timeoutMs,
      context: { deliveryId: message.deliveryId, channel: this.channel },
      body: {
        from: this.config.fromAddress,
        to: recipient,
        subject: message.subject,
        text: message.body,
      },
    });

    this.logger.info("Email dispatched", {
      deliveryId: message.deliveryId,
      status: response.status,
    });

    return { providerMessageId: extractMessageId(response.bodyText) };
  }
}

/**
 * Providers disagree on the field name, so a handful are probed. A missing id
 * is not an error: it only costs traceability, not delivery.
 */
function extractMessageId(bodyText: string): string | null {
  if (bodyText.length === 0) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(bodyText);

    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const record = parsed as Record<string, unknown>;

    for (const field of ["id", "messageId", "message_id"]) {
      const value = record[field];

      if (typeof value === "string") {
        return value;
      }
    }

    return null;
  } catch {
    return null;
  }
}
