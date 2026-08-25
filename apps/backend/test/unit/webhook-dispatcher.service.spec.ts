import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../src/database/prisma.service";
import type { Logger } from "../../src/logging/logger";
import { WebhookDispatcherService } from "../../src/modules/integrations/webhook-dispatcher.service";

const webhookId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const updatedAt = new Date("2026-01-01T00:00:00.000Z");

function webhook(overrides: Partial<{ events: string[]; active: boolean; successRate: number }> = {}) {
  return {
    id: webhookId,
    name: "Forecast Update",
    url: "https://example.test/webhook",
    events: overrides.events ?? ["connection.synced"],
    active: overrides.active ?? true,
    successRate: overrides.successRate ?? 100,
    createdAt: updatedAt,
    updatedAt,
  };
}

function harness(webhooks: ReturnType<typeof webhook>[]) {
  const findMany = vi.fn(async () => webhooks.filter((w) => w.active));
  const findUnique = vi.fn(async ({ where }: { where: { id: string } }) =>
    webhooks.find((w) => w.id === where.id) ?? null,
  );
  const updateMany = vi.fn(async () => ({ count: 1 }));
  const prisma = { webhook: { findMany, findUnique, updateMany } } as unknown as PrismaService;
  const warn = vi.fn();
  const logger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn(), child: () => logger } as Logger;
  return { service: new WebhookDispatcherService(prisma, logger), findMany, findUnique, updateMany, warn };
}

describe("WebhookDispatcherService", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("does not call out when no active webhook subscribes to the event", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const test = harness([webhook({ events: ["other.event"] })]);

    await test.service.dispatch("connection.synced", { connectionId: "x" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the event payload to every active webhook subscribed to it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    const test = harness([webhook({ events: ["connection.synced"] })]);

    await test.service.dispatch("connection.synced", { connectionId: "x", recordsIn: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/webhook");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as { event: string; data: unknown };
    expect(body.event).toBe("connection.synced");
    expect(body.data).toEqual({ connectionId: "x", recordsIn: 5 });
  });

  it("matches a wildcard subscription", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    const test = harness([webhook({ events: ["*"] })]);

    await test.service.dispatch("connection.status_changed", { connectionId: "x" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("moves successRate toward 100 on a successful delivery", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    const test = harness([webhook({ successRate: 50 })]);

    await test.service.dispatch("connection.synced", {});

    expect(test.updateMany).toHaveBeenCalledWith({
      where: { id: webhookId, updatedAt },
      data: { successRate: 60 },
    });
  });

  it("moves successRate toward 0 on a failed delivery and never throws", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    const test = harness([webhook({ successRate: 50 })]);

    await expect(test.service.dispatch("connection.synced", {})).resolves.toBeUndefined();

    expect(test.updateMany).toHaveBeenCalledWith({
      where: { id: webhookId, updatedAt },
      data: { successRate: 40 },
    });
  });

  it("records a failure and never throws when the endpoint is unreachable", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    const test = harness([webhook({ successRate: 100 })]);

    await expect(test.service.dispatch("connection.synced", {})).resolves.toBeUndefined();

    expect(test.updateMany).toHaveBeenCalledWith({
      where: { id: webhookId, updatedAt },
      data: { successRate: 80 },
    });
    expect(test.warn).toHaveBeenCalled();
  });

  it("never throws when looking up subscribers fails", async () => {
    const findMany = vi.fn().mockRejectedValue(new Error("db down"));
    const prisma = { webhook: { findMany } } as unknown as PrismaService;
    const warn = vi.fn();
    const logger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn(), child: () => logger } as Logger;
    const service = new WebhookDispatcherService(prisma, logger);

    await expect(service.dispatch("connection.synced", {})).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
