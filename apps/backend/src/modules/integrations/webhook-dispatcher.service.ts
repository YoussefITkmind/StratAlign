import type { PrismaService } from "../../database/prisma.service";
import type { Logger } from "../../logging/logger";

export interface WebhookEventPayload {
  event: string;
  occurredAt: string;
  data: Record<string, unknown>;
}

const DELIVERY_TIMEOUT_MS = 5_000;
// New outcomes move successRate 20% of the way toward 0 or 100, so one blip
// dents the rate without a single failure crashing it from 100 to 0.
const SUCCESS_RATE_SMOOTHING = 0.2;

/**
 * Fires webhook deliveries for domain events raised inside the integrations
 * module. Every public entry point swallows its own errors: a slow or
 * unreachable subscriber endpoint must never fail, delay, or roll back the
 * business action (a sync, a toggle) that raised the event.
 */
export class WebhookDispatcherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  async dispatch(event: string, data: Record<string, unknown>): Promise<void> {
    try {
      const webhooks = await this.prisma.webhook.findMany({ where: { active: true } });
      const targets = webhooks.filter((webhook) => webhook.events.includes(event) || webhook.events.includes("*"));
      if (targets.length === 0) return;

      const payload: WebhookEventPayload = { event, occurredAt: new Date().toISOString(), data };
      await Promise.allSettled(targets.map((webhook) => this.deliver(webhook.id, webhook.url, payload)));
    } catch (error) {
      this.logger.warn("Webhook dispatch failed to look up subscribers", {
        event,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async deliver(webhookId: string, url: string, payload: WebhookEventPayload): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    let success = false;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-SPM-Event": payload.event },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      success = response.ok;
    } catch (error) {
      this.logger.warn("Webhook delivery failed", {
        webhookId,
        url,
        event: payload.event,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeout);
    }

    await this.recordOutcome(webhookId, success);
  }

  private async recordOutcome(webhookId: string, success: boolean): Promise<void> {
    try {
      const existing = await this.prisma.webhook.findUnique({ where: { id: webhookId } });
      if (!existing) return;

      const nextRate = Math.max(
        0,
        Math.min(
          100,
          Math.round(existing.successRate * (1 - SUCCESS_RATE_SMOOTHING) + (success ? 100 : 0) * SUCCESS_RATE_SMOOTHING),
        ),
      );

      // A lost race here just means a concurrent delivery's outcome is folded
      // in on its own next attempt instead of this one — no retry needed.
      await this.prisma.webhook.updateMany({
        where: { id: webhookId, updatedAt: existing.updatedAt },
        data: { successRate: nextRate },
      });
    } catch (error) {
      this.logger.warn("Failed to record webhook delivery outcome", {
        webhookId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
