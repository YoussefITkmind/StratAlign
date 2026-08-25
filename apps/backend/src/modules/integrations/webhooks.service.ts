import type { PrismaService } from "../../database/prisma.service";
import type { Webhook as WebhookRow } from "../../generated/prisma/client";
import { integrationsErrors } from "./integrations.errors";

export interface WebhookView {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  successRate: number;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  events: string[];
}

function toView(row: WebhookRow): WebhookView {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    events: row.events,
    active: row.active,
    successRate: row.successRate,
  };
}

export class WebhooksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<WebhookView[]> {
    const rows = await this.prisma.webhook.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map(toView);
  }

  async create(input: CreateWebhookInput): Promise<WebhookView> {
    const row = await this.prisma.webhook.create({
      data: {
        name: input.name,
        url: input.url,
        events: input.events.length ? input.events : ["custom.event"],
        active: true,
        successRate: 100,
      },
    });
    return toView(row);
  }

  async toggleActive(id: string): Promise<WebhookView> {
    const existing = await this.prisma.webhook.findUnique({ where: { id } });
    if (!existing) throw integrationsErrors.webhookNotFound();

    const data = { active: !existing.active };
    const { count } = await this.prisma.webhook.updateMany({
      where: { id, updatedAt: existing.updatedAt },
      data,
    });
    if (count === 0) {
      const stillExists = await this.prisma.webhook.findUnique({ where: { id } });
      throw stillExists ? integrationsErrors.concurrentUpdate() : integrationsErrors.webhookNotFound();
    }

    return toView({ ...existing, ...data });
  }

  async delete(id: string): Promise<{ id: string }> {
    const existing = await this.prisma.webhook.findUnique({ where: { id } });
    if (!existing) throw integrationsErrors.webhookNotFound();

    await this.prisma.webhook.delete({ where: { id } });
    return { id };
  }
}
