import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestHarness, waitFor, type TestHarness } from "./support/harness";
import { seedDigestTemplate, seedTemplate } from "./support/fixtures";
import { createNotificationDeliveryWorker } from "../../src/workers/notification.workers";
import {
  NotificationChannel,
  NotificationDeliveryMode,
  NotificationDeliveryStatus,
  NotificationDigestStatus,
  NotificationPriority,
} from "../../src/generated/prisma/enums";

const TEMPLATE_KEY = "schedule.review-due";

/**
 * End-to-end within the notification module: a request becomes a persisted
 * delivery, the real worker picks it up, the fake sender records it, and the
 * outcome is written back to the row.
 */
describe("Notification delivery integration", () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness({ label: "delivery" });
  }, 120_000);

  afterAll(async () => {
    await harness?.teardown();
  });

  beforeEach(async () => {
    await harness.reset();

    await harness.prisma.user.createMany({
      data: [
        { id: "user:ada", email: "ada@example.com" },
        { id: "user:muted", email: "muted@example.com" },
        { id: "user:partial", email: "partial@example.com" },
        { id: "user:digest", email: "digest@example.com" },
        { id: "user:urgent", email: "urgent@example.com" },
      ],
      skipDuplicates: true,
    });

    await seedTemplate(harness.prisma, {
      key: TEMPLATE_KEY,
    });
  });

  /** Starts the production delivery worker, not a test double. */
  function startDeliveryWorker(): void {
    harness.services.workerFactory.create(
      createNotificationDeliveryWorker(harness.services.notificationDispatcher, 2),
    );
  }

  async function requestReviewDue(overrides: Record<string, unknown> = {}) {
    return harness.services.notificationService.request({
      recipientUserId: "user:ada",
      channel: NotificationChannel.EMAIL,
      templateKey: TEMPLATE_KEY,
      data: { periodKey: "2026-08", subjectType: "kpi_collection", subjectId: "kpi-42" },
      address: "ada@example.com",
      dedupeKey: `test-${Math.random().toString(36).slice(2)}`,
      ...overrides,
    });
  }

  describe("immediate delivery", () => {
    it("renders, persists, dispatches and records the outcome", async () => {
      startDeliveryWorker();

      const requested = await requestReviewDue();

      expect(requested.status).toBe(NotificationDeliveryStatus.PENDING);

      const sent = await waitFor("the delivery to be sent", async () => {
        const row = await harness.prisma.notificationDelivery.findUnique({
          where: { id: requested.deliveryId },
        });

        return row?.status === NotificationDeliveryStatus.SENT ? row : null;
      });

      expect(sent.sentAt).toBeInstanceOf(Date);
      expect(sent.providerMessageId).toBe(`fake-${requested.deliveryId}`);
      expect(sent.failedAt).toBeNull();
      expect(sent.lastError).toBeNull();
    });

    it("hands the fake sender the fully rendered message", async () => {
      startDeliveryWorker();

      const requested = await requestReviewDue();

      const messages = await waitFor("the sender to record the message", async () =>
        harness.emailSender.messages().length > 0
          ? harness.emailSender.messages()
          : null,
      );

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        deliveryId: requested.deliveryId,
        channel: NotificationChannel.EMAIL,
        recipientUserId: "user:ada",
        address: "ada@example.com",
        locale: "en",
        subject: "Review due — 2026-08",
      });
      expect(messages[0].body).toBe("A review is due for kpi_collection kpi-42.");
    });

    it("records the fallback locale when the requested one is missing", async () => {
      startDeliveryWorker();

      const requested = await requestReviewDue({ locale: "fr" });

      const row = await harness.prisma.notificationDelivery.findUniqueOrThrow({
        where: { id: requested.deliveryId },
      });

      // The requested locale is kept, and the one actually used is recorded
      // alongside it rather than silently overwriting it.
      expect(row.locale).toBe("fr");
      expect(row.resolvedLocale).toBe("en");
    });
  });

  describe("deduplication", () => {
    it("never sends twice for the same dedupe key", async () => {
      startDeliveryWorker();

      const first = await requestReviewDue({ dedupeKey: "event-1:user:ada:EMAIL" });
      const second = await requestReviewDue({ dedupeKey: "event-1:user:ada:EMAIL" });

      expect(second.deliveryId).toBe(first.deliveryId);
      expect(second.deduplicated).toBe(true);

      await waitFor("the single delivery to be sent", async () =>
        harness.emailSender.messages().length > 0 ? true : null,
      );

      const rows = await harness.prisma.notificationDelivery.count();

      expect(rows).toBe(1);
      expect(harness.emailSender.messages()).toHaveLength(1);
    });

    it("ignores a redelivered job for an already-sent delivery", async () => {
      startDeliveryWorker();

      const requested = await requestReviewDue();

      await waitFor("the first delivery to be fully persisted as sent", async () => {
        const row = await harness.prisma.notificationDelivery.findUnique({
          where: { id: requested.deliveryId },
        });

        return row?.status === NotificationDeliveryStatus.SENT ? row : null;
      });

      // Simulate an at-least-once redelivery after the first delivery has
      // completed and its SENT state has been persisted.
      const outcome = await harness.services.notificationDispatcher.dispatch(
        requested.deliveryId,
      );

      expect(outcome.skipped).toBe(true);
      expect(harness.emailSender.messages()).toHaveLength(1);
    });
  });

  describe("suppression", () => {
    it("persists a suppressed delivery and sends nothing", async () => {
      startDeliveryWorker();

      await harness.prisma.notificationPreference.create({
        data: {
          recipientUserId: "user:muted",
          channel: NotificationChannel.EMAIL,
          isEnabled: false,
        },
      });

      const requested = await requestReviewDue({ recipientUserId: "user:muted" });

      expect(requested.status).toBe(NotificationDeliveryStatus.SUPPRESSED);

      const row = await harness.prisma.notificationDelivery.findUniqueOrThrow({
        where: { id: requested.deliveryId },
      });

      // The reason is retained, so an audit can explain the silence.
      expect(row.lastError).toBe("Recipient has disabled this channel");
      expect(harness.emailSender.messages()).toHaveLength(0);
    });

    it("suppresses a muted template key", async () => {
      await harness.prisma.notificationPreference.create({
        data: {
          recipientUserId: "user:partial",
          channel: NotificationChannel.EMAIL,
          mutedTemplateKeys: [TEMPLATE_KEY],
        },
      });

      const requested = await requestReviewDue({ recipientUserId: "user:partial" });

      expect(requested.status).toBe(NotificationDeliveryStatus.SUPPRESSED);
    });
  });

  describe("permanent failure", () => {
    it("marks a delivery failed when its template does not exist", async () => {
      await expect(
        requestReviewDue({ templateKey: "schedule.does-not-exist" }),
      ).rejects.toThrow("No notification template matched");

      // Rendering happens at request time, so a bad template never becomes a
      // queued delivery that fails silently later.
      expect(await harness.prisma.notificationDelivery.count()).toBe(0);
    });
  });

  describe("digest batching", () => {
    it("defers, batches and sends one summary for a digest recipient", async () => {
      startDeliveryWorker();

      await seedDigestTemplate(harness.prisma);

      await harness.prisma.notificationPreference.create({
        data: {
          recipientUserId: "user:digest",
          channel: NotificationChannel.EMAIL,
          deliveryMode: NotificationDeliveryMode.DIGEST,
          digestIntervalMinutes: 60,
          address: "digest@example.com",
        },
      });

      for (let index = 0; index < 3; index += 1) {
        const deferred = await requestReviewDue({
          recipientUserId: "user:digest",
          address: undefined,
          dedupeKey: `digest-item-${index}`,
        });

        expect(deferred.status).toBe(NotificationDeliveryStatus.DEFERRED);
      }

      // Nothing is sent while the window is open.
      expect(harness.emailSender.messages()).toHaveLength(0);

      // Sweep with a clock past the 60-minute window rather than waiting for
      // it: the service takes `now` precisely so time can be advanced here.
      const twoHoursLater = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const result = await harness.services.digestService.sweep(twoHoursLater);

      expect(result.digestsCreated).toBe(1);
      expect(result.itemsMerged).toBe(3);

      const messages = await waitFor("the digest summary to be sent", async () =>
        harness.emailSender.messages().length > 0
          ? harness.emailSender.messages()
          : null,
      );

      // Three notifications became exactly one message.
      expect(messages).toHaveLength(1);
      expect(messages[0].subject).toBe("You have 3 pending notifications");
      expect(messages[0].body).toContain("Review due — 2026-08");

      const items = await harness.prisma.notificationDelivery.findMany({
        where: { isDigestSummary: false, recipientUserId: "user:digest" },
      });

      expect(items).toHaveLength(3);
      for (const item of items) {
        expect(item.status).toBe(NotificationDeliveryStatus.DIGESTED);
        expect(item.digestId).not.toBeNull();
      }

      const digest = await waitFor("the digest to be marked sent", async () => {
        const row = await harness.prisma.notificationDigest.findFirst({
          where: { recipientUserId: "user:digest" },
        });

        return row?.status === NotificationDigestStatus.SENT ? row : null;
      });

      expect(digest.itemCount).toBe(3);
      expect(digest.sentAt).toBeInstanceOf(Date);
    });

    it("sends nothing when the digest window is empty", async () => {
      await seedDigestTemplate(harness.prisma);

      const result = await harness.services.digestService.sweep(new Date());

      expect(result.digestsCreated).toBe(0);
      expect(harness.emailSender.messages()).toHaveLength(0);
    });

    it("keeps urgent notifications out of the digest", async () => {
      startDeliveryWorker();

      await harness.prisma.notificationPreference.create({
        data: {
          recipientUserId: "user:urgent",
          channel: NotificationChannel.EMAIL,
          deliveryMode: NotificationDeliveryMode.DIGEST,
          address: "urgent@example.com",
        },
      });

      const requested = await requestReviewDue({
        recipientUserId: "user:urgent",
        address: undefined,
        priority: NotificationPriority.URGENT,
      });

      expect(requested.status).toBe(NotificationDeliveryStatus.PENDING);

      await waitFor("the urgent message to be sent immediately", async () =>
        harness.emailSender.messages().length > 0 ? true : null,
      );

      expect(harness.emailSender.messages()).toHaveLength(1);
    });
  });

  describe("channels", () => {
    it("routes each channel to its own sender", async () => {
      startDeliveryWorker();

      await seedTemplate(harness.prisma, {
        key: TEMPLATE_KEY,
        channel: NotificationChannel.TEAMS,
      });

      await requestReviewDue({ dedupeKey: "email-one" });
      await requestReviewDue({
        channel: NotificationChannel.TEAMS,
        address: "https://example.webhook.office.com/hook",
        dedupeKey: "teams-one",
      });

      await waitFor("both channels to deliver", async () =>
        harness.emailSender.messages().length > 0 &&
        harness.senderFor(NotificationChannel.TEAMS).messages().length > 0
          ? true
          : null,
      );

      expect(harness.emailSender.messages()).toHaveLength(1);
      expect(harness.senderFor(NotificationChannel.TEAMS).messages()).toHaveLength(1);
    });
  });
});
