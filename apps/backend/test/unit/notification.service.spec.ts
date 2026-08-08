import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import type { NotificationPreferenceService } from "../../src/modules/notifications/notification.preference.service";
import type { NotificationTemplateService } from "../../src/modules/notifications/template/template.service";
import type { PrismaService } from "../../src/database/prisma.service";
import type { QueueService } from "../../src/queue/queue.service";
import { createLogger } from "../../src/logging/logger";
import {
  NotificationChannel,
  NotificationDeliveryMode,
  NotificationDeliveryStatus,
  NotificationPriority,
} from "../../src/generated/prisma/enums";

const BASE_REQUEST = {
  recipientUserId: "user:ada",
  channel: NotificationChannel.EMAIL,
  templateKey: "schedule.review-due",
  dedupeKey: "event-1:user:ada:EMAIL",
};

describe("NotificationService", () => {
  let findUnique: ReturnType<typeof vi.fn>;
  let findUniqueOrThrow: ReturnType<typeof vi.fn>;
  let create: ReturnType<typeof vi.fn>;
  let enqueue: ReturnType<typeof vi.fn>;
  let resolvePreference: ReturnType<typeof vi.fn>;
  let render: ReturnType<typeof vi.fn>;
  let service: NotificationService;

  function preference(overrides: Record<string, unknown> = {}) {
    return {
      recipientUserId: "user:ada",
      channel: NotificationChannel.EMAIL,
      deliveryMode: NotificationDeliveryMode.IMMEDIATE,
      digestIntervalMinutes: 1440,
      locale: "en",
      timezone: "UTC",
      address: "ada@example.com",
      mutedTemplateKeys: [],
      isEnabled: true,
      isExplicit: true,
      ...overrides,
    };
  }

  beforeEach(() => {
    findUnique = vi.fn().mockResolvedValue(null);
    findUniqueOrThrow = vi.fn();
    create = vi.fn().mockImplementation(async (args: { data: { status: string } }) => ({
      id: "delivery-1",
      status: args.data.status,
    }));
    enqueue = vi.fn().mockResolvedValue(undefined);
    resolvePreference = vi.fn().mockResolvedValue(preference());
    render = vi.fn().mockResolvedValue({
      locale: "en",
      subject: "Review due",
      body: "A review is due.",
    });

    const prisma = {
      notificationDelivery: { findUnique, findUniqueOrThrow, create },
    } as unknown as PrismaService;

    service = new NotificationService(
      prisma,
      { resolve: resolvePreference } as unknown as NotificationPreferenceService,
      {
        buildLocaleCandidates: (...locales: (string | null | undefined)[]) =>
          [...locales.filter(Boolean), "en"] as string[],
        render,
      } as unknown as NotificationTemplateService,
      { enqueue } as unknown as QueueService,
      { enabled: true, maxAttempts: 5 },
      createLogger("error"),
    );
  });

  it("creates a pending delivery and enqueues it", async () => {
    const result = await service.request(BASE_REQUEST);

    expect(result.status).toBe(NotificationDeliveryStatus.PENDING);
    expect(result.deduplicated).toBe(false);
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it("freezes the rendered content onto the delivery at request time", async () => {
    await service.request(BASE_REQUEST);

    const data = create.mock.calls[0][0].data;

    expect(data.subject).toBe("Review due");
    expect(data.body).toBe("A review is due.");
    expect(data.resolvedLocale).toBe("en");
  });

  it("returns the existing delivery when the dedupe key was already used", async () => {
    findUnique.mockResolvedValue({
      id: "delivery-existing",
      status: NotificationDeliveryStatus.SENT,
    });

    const result = await service.request(BASE_REQUEST);

    expect(result).toEqual({
      deliveryId: "delivery-existing",
      status: NotificationDeliveryStatus.SENT,
      deduplicated: true,
    });
    expect(create).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("resolves a concurrent unique-constraint race to the winning row", async () => {
    create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    findUniqueOrThrow.mockResolvedValue({
      id: "delivery-winner",
      status: NotificationDeliveryStatus.PENDING,
    });

    const result = await service.request(BASE_REQUEST);

    expect(result.deliveryId).toBe("delivery-winner");
    expect(result.deduplicated).toBe(true);
  });

  it("defers to the digest when the recipient prefers it", async () => {
    resolvePreference.mockResolvedValue(
      preference({ deliveryMode: NotificationDeliveryMode.DIGEST }),
    );

    const result = await service.request(BASE_REQUEST);

    expect(result.status).toBe(NotificationDeliveryStatus.DEFERRED);
    // Deferred rows are collected by the digest sweep, not the delivery queue.
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("bypasses the digest for urgent messages", async () => {
    resolvePreference.mockResolvedValue(
      preference({ deliveryMode: NotificationDeliveryMode.DIGEST }),
    );

    const result = await service.request({
      ...BASE_REQUEST,
      priority: NotificationPriority.URGENT,
    });

    expect(result.status).toBe(NotificationDeliveryStatus.PENDING);
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it("suppresses when the recipient disabled the channel", async () => {
    resolvePreference.mockResolvedValue(preference({ isEnabled: false }));

    const result = await service.request(BASE_REQUEST);

    expect(result.status).toBe(NotificationDeliveryStatus.SUPPRESSED);
    expect(render).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("suppresses a muted template key", async () => {
    resolvePreference.mockResolvedValue(
      preference({ mutedTemplateKeys: ["schedule.review-due"] }),
    );

    const result = await service.request(BASE_REQUEST);

    expect(result.status).toBe(NotificationDeliveryStatus.SUPPRESSED);
  });

  it("suppresses everything when notifications are disabled globally", async () => {
    const prisma = {
      notificationDelivery: { findUnique, findUniqueOrThrow, create },
    } as unknown as PrismaService;

    const disabled = new NotificationService(
      prisma,
      { resolve: resolvePreference } as unknown as NotificationPreferenceService,
      {
        buildLocaleCandidates: () => ["en"],
        render,
      } as unknown as NotificationTemplateService,
      { enqueue } as unknown as QueueService,
      { enabled: false, maxAttempts: 5 },
      createLogger("error"),
    );

    const result = await disabled.request(BASE_REQUEST);

    expect(result.status).toBe(NotificationDeliveryStatus.SUPPRESSED);
  });

  it("prefers an explicitly supplied address over the stored preference", async () => {
    await service.request({ ...BASE_REQUEST, address: "override@example.com" });

    expect(create.mock.calls[0][0].data.recipientAddress).toBe("override@example.com");
  });
});
