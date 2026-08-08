import { PermanentError } from "../../../errors/app.errors";
import { NotificationChannel } from "../../../generated/prisma/enums";
import type { Logger } from "../../../logging/logger";
import type { NotificationSender } from "./sender.contract";
import { EmailSender } from "./email.sender";
import { FakeSender } from "./fake.sender";
import { TeamsSender } from "./teams.sender";

export interface SenderRegistryEnvironment {
  NOTIFICATION_SENDER_MODE: "live" | "fake";
  EMAIL_API_URL?: string;
  EMAIL_API_KEY?: string;
  EMAIL_FROM_ADDRESS?: string;
  EMAIL_TIMEOUT_MS: number;
  TEAMS_WEBHOOK_URL?: string;
  TEAMS_TIMEOUT_MS: number;
}

/**
 * Channel-to-sender lookup. The dispatcher depends on this rather than on any
 * concrete sender, so adding a channel is one new class plus one registration
 * and touches nothing else.
 */
export class SenderRegistry {
  private readonly senders = new Map<NotificationChannel, NotificationSender>();

  register(sender: NotificationSender): void {
    this.senders.set(sender.channel, sender);
  }

  get(channel: NotificationChannel): NotificationSender {
    const sender = this.senders.get(channel);

    if (!sender) {
      // No amount of retrying will register a sender.
      throw new PermanentError("No sender is registered for channel", {
        channel,
      });
    }

    return sender;
  }

  channels(): NotificationChannel[] {
    return [...this.senders.keys()];
  }
}

/**
 * Builds the registry for the current configuration.
 *
 * In `fake` mode every supported channel resolves to a `FakeSender`.
 * so nothing leaves the process. In `live` mode the real senders are
 * constructed and their configuration is validated immediately — a missing
 * API key fails the boot rather than the first delivery.
 */
export function createSenderRegistry(
  environment: SenderRegistryEnvironment,
  logger: Logger,
): SenderRegistry {
  const registry = new SenderRegistry();

  if (environment.NOTIFICATION_SENDER_MODE === "fake") {
    for (const channel of Object.values(NotificationChannel)) {
      registry.register(new FakeSender(channel, logger.child("fake-sender")));
    }

    logger.warn("Notification senders are running in fake mode; no messages will leave the process");

    return registry;
  }

  registry.register(
    EmailSender.fromEnvironment(environment, logger.child("email-sender")),
  );

  registry.register(
    new TeamsSender(
      {
        defaultWebhookUrl: environment.TEAMS_WEBHOOK_URL ?? null,
        timeoutMs: environment.TEAMS_TIMEOUT_MS,
      },
      logger.child("teams-sender"),
    ),
  );
return registry;
}
