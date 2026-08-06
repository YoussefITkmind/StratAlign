import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestHarness, waitFor, type TestHarness } from "../integration/support/harness";
import { seedScheduleTemplates } from "../integration/support/fixtures";
import {
  createMaterializeWorker,
  createSchedulerTickWorker,
  createTransitionWorker,
} from "../../src/workers/scheduler.workers";
import {
  createEventDispatchWorker,
  createOutboxRelayWorker,
} from "../../src/workers/event.workers";
import { createNotificationDeliveryWorker } from "../../src/workers/notification.workers";
import { SCHEDULE_EVENT_TYPES } from "../../src/modules/scheduler/scheduler.events";
import {
  CadenceInstanceStatus,
  DomainEventStatus,
  NotificationChannel,
  NotificationDeliveryStatus,
} from "../../src/generated/prisma/enums";

/**
 * The whole of Track C, end to end, on real Postgres and real Redis:
 *
 *   Scheduler -> Event -> Template rendering -> NotificationDelivery
 *             -> Fake sender -> Delivery log
 *
 * The schedule is *compressed*, not accelerated: every milestone offset is
 * zero and the occurrence is back-dated a second, so all four milestones are
 * already due the moment the instance is materialised and `advance` walks the
 * entire state machine in one pass. No clock is mocked, no timer is faked, and
 * nothing waits on wall-clock time — assertions poll for a condition and
 * return the instant it holds.
 *
 * Every worker here is the production one from `src/workers`, wired by the
 * production `createServiceGraph`, so this exercises the same code path the
 * deployed worker process runs.
 */
describe("End to end: compressed schedule through to delivery", () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness({
      label: "e2e",
      overrides: {
        // The tick is only a safety net here; milestones are driven by the
        // exactly-delayed jobs the generator enqueues.
        SCHEDULER_TICK_INTERVAL_MS: "1000",
        EVENT_RELAY_INTERVAL_MS: "1000",
      },
    });
  });

  afterAll(async () => {
    await harness?.teardown();
  });

  beforeEach(async () => {
    await harness.reset();
    await seedScheduleTemplates(harness.prisma, { locales: ["en", "ar"] });
  });

  /** Starts the full production worker set. */
  function startAllWorkers(): void {
    const { services } = harness;

    services.workerFactory.create(createSchedulerTickWorker(services.tickService));
    services.workerFactory.create(createMaterializeWorker(services.cadenceGenerator, 2));
    services.workerFactory.create(
      createTransitionWorker(services.transitionService, services.logger, 2),
    );
    services.workerFactory.create(createOutboxRelayWorker(services.outboxRelay));
    services.workerFactory.create(createEventDispatchWorker(services.eventDispatcher, 4));
    services.workerFactory.create(
      createNotificationDeliveryWorker(services.notificationDispatcher, 4),
    );
  }

  /**
   * A one-shot cadence with every milestone offset set to zero and its
   * occurrence a moment in the past.
   *
   * This is the compression: rather than waiting for a window to open, close
   * and fall due, all four milestones are already due the instant the instance
   * is materialised, so `advance` walks the entire state machine in one pass.
   * Nothing here waits on wall-clock time.
   *
   * `notification` inside `payload` is opaque to the scheduler — the schedule
   * notification subscriber is what interprets it, which is precisely the
   * separation this test is meant to prove.
   */
  async function createCompressedSchedule(options: {
    recipientRef?: string;
    channel?: NotificationChannel;
    locale?: string;
  } = {}) {
    const now = Date.now();
    const startsAt = new Date(now - 5_000);
    const occurrenceAt = new Date(now - 1_000);

    return harness.services.schedulerService.createDefinition({
      key: "e2e-compressed",
      name: "Compressed review cycle",
      subjectType: "kpi_collection",
      subjectId: "kpi-42",
      payload: {
        notification: {
          templateKey: "schedule",
          recipients: [
            {
              recipientRef: options.recipientRef ?? "user:ada",
              channel: options.channel ?? NotificationChannel.EMAIL,
              address: "ada@example.com",
              locale: options.locale,
            },
          ],
        },
      },
      cadence: { type: "ONCE", runAt: occurrenceAt.toISOString() },
      startsAt,
      anchorAt: startsAt,
      windowOpenOffsetMinutes: 0,
      windowDurationMinutes: 0,
      closingWarningMinutes: 0,
      reviewDueOffsetMinutes: 0,
      lookaheadSeconds: 60,
    });
  }

  /**
   * Runs one scheduler tick explicitly rather than registering the repeatable
   * job, so the pipeline starts at a known instant instead of whenever a timer
   * happens to fire. Materialisation then enqueues the transition itself.
   */
  async function runTick(): Promise<void> {
    await harness.services.tickService.tick();
  }

  it("drives a schedule from creation to a recorded delivery", async () => {
    startAllWorkers();

    const definition = await createCompressedSchedule();
    await runTick();

    // ---- Scheduler ------------------------------------------------------
    const instance = await waitFor("the instance to reach REVIEW_DUE", async () => {
      const row = await harness.prisma.cadenceInstance.findFirst({
        where: { cadenceDefinitionId: definition.id },
      });

      return row?.status === CadenceInstanceStatus.REVIEW_DUE ? row : null;
    });

    expect(instance.openedAt).toBeInstanceOf(Date);
    expect(instance.closedAt).toBeInstanceOf(Date);
    expect(instance.reviewNotifiedAt).toBeInstanceOf(Date);
    // The terminal milestone has no successor to schedule.
    expect(instance.nextTransitionAt).toBeNull();

    // ---- Event ----------------------------------------------------------
    const reviewDueEvent = await waitFor("the review.due event to publish", async () => {
      const row = await harness.prisma.domainEvent.findFirst({
        where: {
          eventType: SCHEDULE_EVENT_TYPES.reviewDue,
          aggregateId: instance.id,
        },
      });

      return row?.status === DomainEventStatus.PUBLISHED ? row : null;
    });

    const payload = reviewDueEvent.payload as Record<string, unknown>;

    // The event carries the opaque subject straight through, untouched.
    expect(payload.subjectType).toBe("kpi_collection");
    expect(payload.subjectId).toBe("kpi-42");
    expect(payload.cadenceInstanceId).toBe(instance.id);
    // One event per milestone, forever.
    expect(reviewDueEvent.dedupeKey).toBe(
      `${instance.id}:${SCHEDULE_EVENT_TYPES.reviewDue}`,
    );

    // All four milestone events were published, in order.
    const allEvents = await harness.prisma.domainEvent.findMany({
      where: { aggregateId: instance.id },
      orderBy: { occurredAt: "asc" },
    });

    expect(allEvents.map((event) => event.eventType)).toEqual([
      SCHEDULE_EVENT_TYPES.windowOpened,
      SCHEDULE_EVENT_TYPES.windowClosing,
      SCHEDULE_EVENT_TYPES.windowClosed,
      SCHEDULE_EVENT_TYPES.reviewDue,
    ]);

    // ---- Template rendering + NotificationDelivery -----------------------
    const delivery = await waitFor("the review.due delivery to be sent", async () => {
      const row = await harness.prisma.notificationDelivery.findFirst({
        where: { templateKey: "schedule.review-due", recipientRef: "user:ada" },
      });

      return row?.status === NotificationDeliveryStatus.SENT ? row : null;
    });

    expect(delivery.resolvedLocale).toBe("en");
    expect(delivery.subject).toBe("Review due — ");
    expect(delivery.body).toBe("A review is due for kpi_collection kpi-42.");
    // Traceable back to the event that caused it.
    expect(delivery.sourceEventId).toBe(reviewDueEvent.id);
    expect(delivery.sentAt).toBeInstanceOf(Date);

    // ---- Fake sender + delivery log --------------------------------------
    const logged = harness.emailSender
      .messages()
      .filter((message) => message.deliveryId === delivery.id);

    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      channel: NotificationChannel.EMAIL,
      recipientRef: "user:ada",
      address: "ada@example.com",
      locale: "en",
      subject: "Review due — ",
    });
    expect(delivery.providerMessageId).toBe(`fake-${delivery.id}`);
  });

  it("produces one notification per milestone, each rendered from its own template", async () => {
    startAllWorkers();

    const definition = await createCompressedSchedule();
    await runTick();

    const deliveries = await waitFor(
      "all four milestone notifications to be sent",
      async () => {
        const rows = await harness.prisma.notificationDelivery.findMany({
          where: { recipientRef: "user:ada" },
          orderBy: { createdAt: "asc" },
        });

        return rows.length === 4 &&
          rows.every((row) => row.status === NotificationDeliveryStatus.SENT)
          ? rows
          : null;
      },
    );

    expect(deliveries.map((row) => row.templateKey).sort()).toEqual([
      "schedule.review-due",
      "schedule.window-closed",
      "schedule.window-closing",
      "schedule.window-opened",
    ]);

    // Each is deduplicated against the event that produced it, so a redelivered
    // event cannot double-send.
    for (const row of deliveries) {
      expect(row.dedupeKey).toMatch(/user:ada:EMAIL$/);
    }

    expect(harness.emailSender.messages()).toHaveLength(4);

    const instance = await harness.prisma.cadenceInstance.findFirstOrThrow({
      where: { cadenceDefinitionId: definition.id },
    });

    expect(instance.status).toBe(CadenceInstanceStatus.REVIEW_DUE);
  });

  it("delivers the review notification in Arabic when the recipient prefers it", async () => {
    startAllWorkers();

    await createCompressedSchedule({ recipientRef: "user:sara", locale: "ar" });
    await runTick();

    const delivery = await waitFor("the Arabic review delivery", async () => {
      const row = await harness.prisma.notificationDelivery.findFirst({
        where: { templateKey: "schedule.review-due", recipientRef: "user:sara" },
      });

      return row?.status === NotificationDeliveryStatus.SENT ? row : null;
    });

    expect(delivery.resolvedLocale).toBe("ar");
    expect(delivery.subject).toBe("المراجعة مستحقة — ");

    const logged = harness
      .senderFor(NotificationChannel.EMAIL)
      .messages()
      .find((message) => message.deliveryId === delivery.id);

    expect(logged?.locale).toBe("ar");
  });

  it("emits schedule events but no notifications when the payload carries none", async () => {
    startAllWorkers();

    const now = Date.now();
    const startsAt = new Date(now - 5_000);
    const occurrenceAt = new Date(now - 1_000);

    const definition = await harness.services.schedulerService.createDefinition({
      key: "e2e-no-notification",
      name: "Compressed cycle without notifications",
      subjectType: "okr_checkin",
      subjectId: "okr-7",
      // No `notification` block: a schedule that exists only to wake some
      // other module up. The subscriber must treat this as a legitimate no-op.
      payload: { somethingElse: true },
      cadence: { type: "ONCE", runAt: occurrenceAt.toISOString() },
      startsAt,
      anchorAt: startsAt,
      windowOpenOffsetMinutes: 0,
      windowDurationMinutes: 0,
      closingWarningMinutes: 0,
      reviewDueOffsetMinutes: 0,
      lookaheadSeconds: 60,
    });

    await runTick();

    const instance = await waitFor("the instance to reach REVIEW_DUE", async () => {
      const row = await harness.prisma.cadenceInstance.findFirst({
        where: { cadenceDefinitionId: definition.id },
      });

      return row?.status === CadenceInstanceStatus.REVIEW_DUE ? row : null;
    });

    await waitFor("every event to be published", async () => {
      const pending = await harness.prisma.domainEvent.count({
        where: { aggregateId: instance.id, status: DomainEventStatus.PENDING },
      });

      return pending === 0 ? true : null;
    });

    expect(
      await harness.prisma.domainEvent.count({ where: { aggregateId: instance.id } }),
    ).toBe(4);

    // The scheduler did its job; the notification module correctly declined.
    expect(await harness.prisma.notificationDelivery.count()).toBe(0);
    expect(harness.emailSender.messages()).toHaveLength(0);
  });

  it("does not re-send when the same event is dispatched again", async () => {
    startAllWorkers();

    await createCompressedSchedule();
    await runTick();

    const delivery = await waitFor("the review delivery to be sent", async () => {
      const row = await harness.prisma.notificationDelivery.findFirst({
        where: { templateKey: "schedule.review-due" },
      });

      return row?.status === NotificationDeliveryStatus.SENT ? row : null;
    });

    const event = await harness.prisma.domainEvent.findFirstOrThrow({
      where: { eventType: SCHEDULE_EVENT_TYPES.reviewDue },
    });

    const sentBefore = harness.emailSender.messages().length;

    // Replay the event through the subscriber, as an at-least-once transport
    // legitimately might.
    await harness.services.eventDispatcher.dispatch({
      eventId: event.id,
      subscriberId: "notifications.schedule",
      envelope: {
        eventId: event.id,
        eventType: event.eventType,
        eventVersion: event.eventVersion,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        occurredAt: event.occurredAt.toISOString(),
        payload: event.payload as Record<string, unknown>,
      },
    });

    expect(harness.emailSender.messages()).toHaveLength(sentBefore);

    expect(
      await harness.prisma.notificationDelivery.count({
        where: { templateKey: "schedule.review-due" },
      }),
    ).toBe(1);

    const unchanged = await harness.prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
    });

    expect(unchanged.sentAt?.toISOString()).toBe(delivery.sentAt?.toISOString());
  });
});
