import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIGEST_SUMMARY_TEMPLATE_KEY,
  DigestService,
} from "../../src/modules/notifications/digest/digest.service";
import type { NotificationPreferenceService } from "../../src/modules/notifications/notification.preference.service";
import type { NotificationTemplateService } from "../../src/modules/notifications/template/template.service";
import type { PrismaService } from "../../src/database/prisma.service";
import type { QueueService } from "../../src/queue/queue.service";
import { createLogger } from "../../src/logging/logger";
import {
  NotificationChannel,
  NotificationDeliveryMode,
  NotificationDeliveryStatus,
  NotificationDigestStatus,
} from "../../src/generated/prisma/enums";

const NOW = new Date("2026-08-05T12:00:00Z");
const ONE_HOUR_AGO = new Date("2026-08-05T11:00:00Z");
const TWO_DAYS_AGO = new Date("2026-08-03T12:00:00Z");

function deferredItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "delivery-1",
    recipientRef: "user:ada",
    channel: NotificationChannel.EMAIL,
    templateKey: "schedule.review-due",
    subject: "Review due — 2026-08",
    createdAt: TWO_DAYS_AGO,
    status: NotificationDeliveryStatus.DEFERRED,
    ...overrides,
  };
}

describe("DigestService", () => {
  let groupBy: ReturnType<typeof vi.fn>;
  let deliveryFindMany: ReturnType<typeof vi.fn>;
  let deliveryCreate: ReturnType<typeof vi.fn>;
  let deliveryUpdateMany: ReturnType<typeof vi.fn>;
  let digestCreate: ReturnType<typeof vi.fn>;
  let resolvePreference: ReturnType<typeof vi.fn>;
  let render: ReturnType<typeof vi.fn>;
  let enqueue: ReturnType<typeof vi.fn>;
  let service: DigestService;

  function preference(overrides: Record<string, unknown> = {}) {
    return {
      recipientRef: "user:ada",
      channel: NotificationChannel.EMAIL,
      deliveryMode: NotificationDeliveryMode.DIGEST,
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

  function buildService(config: Partial<{ enabled: boolean; maxItems: number }> = {}) {
    const tx = {
      notificationDigest: { create: digestCreate },
      notificationDelivery: {
        create: deliveryCreate,
        updateMany: deliveryUpdateMany,
      },
    };

    const prisma = {
      notificationDelivery: {
        groupBy,
        findMany: deliveryFindMany,
      },
      $transaction: vi.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as unknown as PrismaService;

    return new DigestService(
      prisma,
      { resolve: resolvePreference } as unknown as NotificationPreferenceService,
      {
        buildLocaleCandidates: (locale?: string) => [locale ?? "en", "en"],
        render,
      } as unknown as NotificationTemplateService,
      { enqueue } as unknown as QueueService,
      { enabled: config.enabled ?? true, maxItems: config.maxItems ?? 50, maxAttempts: 5 },
      createLogger("error"),
    );
  }

  beforeEach(() => {
    groupBy = vi.fn().mockResolvedValue([
      { recipientRef: "user:ada", channel: NotificationChannel.EMAIL },
    ]);
    deliveryFindMany = vi.fn().mockResolvedValue([deferredItem()]);
    deliveryCreate = vi.fn().mockResolvedValue({ id: "summary-1" });
    deliveryUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    digestCreate = vi.fn().mockResolvedValue({ id: "digest-1" });
    resolvePreference = vi.fn().mockResolvedValue(preference());
    render = vi.fn().mockResolvedValue({
      locale: "en",
      subject: "You have 1 pending notifications",
      body: "• Review due — 2026-08",
    });
    enqueue = vi.fn().mockResolvedValue(undefined);

    service = buildService();
  });

  describe("batching window", () => {
    it("builds a digest once the oldest item has waited a full interval", async () => {
      const result = await service.sweep(NOW);

      expect(result.digestsCreated).toBe(1);
      expect(result.itemsMerged).toBe(1);
      expect(digestCreate).toHaveBeenCalledOnce();
    });

    it("waits when the oldest item has not waited long enough yet", async () => {
      deliveryFindMany.mockResolvedValue([
        deferredItem({ createdAt: ONE_HOUR_AGO }),
      ]);

      const result = await service.sweep(NOW);

      // A 1440-minute interval, one hour of waiting: not due.
      expect(result.digestsCreated).toBe(0);
      expect(digestCreate).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
    });

    it("honours a shorter per-recipient interval", async () => {
      resolvePreference.mockResolvedValue(
        preference({ digestIntervalMinutes: 30 }),
      );
      deliveryFindMany.mockResolvedValue([
        deferredItem({ createdAt: ONE_HOUR_AGO }),
      ]);

      const result = await service.sweep(NOW);

      // An hour of waiting clears a 30-minute interval.
      expect(result.digestsCreated).toBe(1);
    });

    it("anchors the digest window to the oldest deferred item", async () => {
      await service.sweep(NOW);

      const data = digestCreate.mock.calls[0][0].data;

      expect((data.windowStartsAt as Date).toISOString()).toBe(
        TWO_DAYS_AGO.toISOString(),
      );
      expect((data.windowEndsAt as Date).toISOString()).toBe(NOW.toISOString());
    });
  });

  describe("empty and disabled cases", () => {
    it("sends nothing when there is nothing deferred", async () => {
      groupBy.mockResolvedValue([]);

      const result = await service.sweep(NOW);

      expect(result).toEqual({
        groupsExamined: 0,
        digestsCreated: 0,
        itemsMerged: 0,
      });
      expect(enqueue).not.toHaveBeenCalled();
    });

    it("never creates an empty digest", async () => {
      deliveryFindMany.mockResolvedValue([]);

      const result = await service.sweep(NOW);

      // An empty daily digest should be silence, not an empty message.
      expect(result.digestsCreated).toBe(0);
      expect(digestCreate).not.toHaveBeenCalled();
    });

    it("does nothing at all when digests are disabled", async () => {
      const disabled = buildService({ enabled: false });

      const result = await disabled.sweep(NOW);

      expect(result.groupsExamined).toBe(0);
      expect(groupBy).not.toHaveBeenCalled();
    });
  });

  describe("merging", () => {
    it("merges every item for a recipient into one summary delivery", async () => {
      deliveryFindMany.mockResolvedValue([
        deferredItem({ id: "d1", subject: "First" }),
        deferredItem({ id: "d2", subject: "Second" }),
        deferredItem({ id: "d3", subject: "Third" }),
      ]);

      const result = await service.sweep(NOW);

      expect(result.itemsMerged).toBe(3);
      // Three notifications become exactly one message.
      expect(deliveryCreate).toHaveBeenCalledOnce();
      expect(digestCreate.mock.calls[0][0].data.itemCount).toBe(3);
    });

    it("pre-formats the item list, since the renderer has no loop syntax", async () => {
      deliveryFindMany.mockResolvedValue([
        deferredItem({ id: "d1", subject: "First" }),
        deferredItem({ id: "d2", subject: "Second" }),
      ]);

      await service.sweep(NOW);

      const data = render.mock.calls[0][3];

      expect(data.count).toBe(2);
      expect(data.items).toEqual(["• First", "• Second"]);
    });

    it("falls back to the template key when an item has no subject", async () => {
      deliveryFindMany.mockResolvedValue([
        deferredItem({ subject: null, templateKey: "schedule.review-due" }),
      ]);

      await service.sweep(NOW);

      expect(render.mock.calls[0][3].items).toEqual(["• schedule.review-due"]);
    });

    it("marks merged items DIGESTED rather than SENT", async () => {
      await service.sweep(NOW);

      const update = deliveryUpdateMany.mock.calls[0][0];

      // They were rolled up, not individually delivered — the distinction
      // matters when auditing what a recipient actually received.
      expect(update.data.status).toBe(NotificationDeliveryStatus.DIGESTED);
      expect(update.data.digestId).toBe("digest-1");
      // Only rows still DEFERRED are claimed, so a concurrent sweep cannot
      // steal items already merged elsewhere.
      expect(update.where.status).toBe(NotificationDeliveryStatus.DEFERRED);
    });

    it("caps the number of items in one digest", async () => {
      const capped = buildService({ maxItems: 10 });

      await capped.sweep(NOW);

      expect(deliveryFindMany.mock.calls[0][0].take).toBe(10);
    });

    it("takes the oldest items first", async () => {
      await service.sweep(NOW);

      expect(deliveryFindMany.mock.calls[0][0].orderBy).toEqual({ createdAt: "asc" });
    });
  });

  describe("summary delivery", () => {
    it("creates the summary as an immediate, flagged delivery", async () => {
      await service.sweep(NOW);

      const data = deliveryCreate.mock.calls[0][0].data;

      expect(data.templateKey).toBe(DIGEST_SUMMARY_TEMPLATE_KEY);
      expect(data.isDigestSummary).toBe(true);
      expect(data.digestId).toBe("digest-1");
      expect(data.deliveryMode).toBe(NotificationDeliveryMode.IMMEDIATE);
      expect(data.status).toBe(NotificationDeliveryStatus.PENDING);
      // Deterministic key, so a replayed sweep cannot double-send a digest.
      expect(data.dedupeKey).toBe("digest:digest-1");
    });

    it("opens the digest rather than pre-marking it sent", async () => {
      await service.sweep(NOW);

      expect(digestCreate.mock.calls[0][0].data.status).toBe(
        NotificationDigestStatus.OPEN,
      );
    });

    it("enqueues the summary for delivery after the transaction commits", async () => {
      await service.sweep(NOW);

      expect(enqueue).toHaveBeenCalledOnce();
      const [, , payload, options] = enqueue.mock.calls[0];

      expect(payload).toEqual({ deliveryId: "summary-1" });
      expect(options.jobId).toBe("delivery--summary-1");
    });

    it("renders the summary in the recipient's locale", async () => {
      resolvePreference.mockResolvedValue(preference({ locale: "ar" }));

      await service.sweep(NOW);

      expect(render.mock.calls[0][2]).toEqual(["ar", "en"]);
    });
  });

  describe("concurrency", () => {
    it("treats a duplicate window as already handled", async () => {
      digestCreate.mockRejectedValue(
        Object.assign(new Error("unique"), { code: "P2002" }),
      );

      const result = await service.sweep(NOW);

      // The unique index on (recipient, channel, windowStartsAt) is what makes
      // a concurrent sweep safe.
      expect(result.digestsCreated).toBe(0);
      expect(enqueue).not.toHaveBeenCalled();
    });

    it("propagates an unexpected failure", async () => {
      digestCreate.mockRejectedValue(new Error("connection reset"));

      await expect(service.sweep(NOW)).rejects.toThrow("connection reset");
    });

    it("processes each recipient and channel group independently", async () => {
      groupBy.mockResolvedValue([
        { recipientRef: "user:ada", channel: NotificationChannel.EMAIL },
        { recipientRef: "user:ada", channel: NotificationChannel.TEAMS },
        { recipientRef: "user:bob", channel: NotificationChannel.EMAIL },
      ]);

      const result = await service.sweep(NOW);

      expect(result.groupsExamined).toBe(3);
      expect(digestCreate).toHaveBeenCalledTimes(3);
    });
  });
});
