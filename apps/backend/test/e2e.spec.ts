import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupTestEnvironment, TestEnvironment } from './db-test-helper';
import { AppModule } from '../src/app.module';
import { SchedulerService } from '../src/modules/scheduler/scheduler.service';
import { EventBusService } from '../src/common/event-bus/event-bus.service';
import {
  SCHEDULE_EVENTS,
  ScheduleReviewDueEvent,
} from '../src/modules/scheduler/events/schedule.events';
import {
  Locale,
  NotificationChannel,
  DeliveryStatus,
  CadenceType,
} from '@prisma/client';
import { ConsoleSender } from '../src/modules/notification/senders/console.sender';

describe('End to End Scheduler and Notification Flow', () => {
  let env: TestEnvironment;
  let moduleFixture: TestingModule;
  let schedulerService: SchedulerService;
  let eventBus: EventBusService;
  let consoleSender: ConsoleSender;

  beforeAll(async () => {
    // Setup postgres and redis test containers
    env = await setupTestEnvironment();

    // Boot real NestJS application context
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    await moduleFixture.init();

    schedulerService = moduleFixture.get<SchedulerService>(SchedulerService);
    eventBus = moduleFixture.get<EventBusService>(EventBusService);
    consoleSender = moduleFixture.get<ConsoleSender>(ConsoleSender);
  });

  afterAll(async () => {
    if (moduleFixture) {
      await moduleFixture.close();
    }
    await env.cleanup();
  });

  it('should run full scheduler -> event -> notification -> delivery log flow', async () => {
    // Clean up stale data from prior test runs
    await env.prisma.entitySnapshot.deleteMany({});
    await env.prisma.journalEntry.deleteMany({});
    await env.prisma.notificationDelivery.deleteMany({});

    // 1. Create a user
    const user = await env.prisma.user.create({
      data: {
        name: 'Ahmed',
        email: 'ahmed-e2e@example.com',
        preferredLocale: Locale.EN,
      },
    });

    // 2. Create the notification template that the EventListener will query
    await env.prisma.notificationTemplate.create({
      data: {
        key: 'review-due',
        channel: NotificationChannel.EMAIL,
        subjectEn: 'Review Due for {{period}}',
        subjectAr: 'Review Due for {{period}}',
        bodyEn: 'Hello {{name}}, your review for {{period}} is due.',
        bodyAr: 'Hello {{name}}, your review for {{period}} is due.',
        digestible: false,
      },
    });

    // 3. Create a PeriodCalendar
    const calendar = await env.prisma.periodCalendar.create({
      data: {
        name: 'FY 2026',
        fiscalYear: 2026,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T23:59:59.999Z'),
      },
    });

    // 4. Create CadenceDefinition
    const definition = await schedulerService.createCadence({
      name: 'E2E Monthly Cadence',
      cadenceType: CadenceType.MONTHLY,
      dayOffset: 10,
      warningLeadDays: 5,
      active: true,
    });

    // 5. Generate CadenceInstance
    const instances = await schedulerService.generateFutureInstances(
      definition.id,
      calendar.id,
      12,
    );
    expect(instances).toHaveLength(12);

    const firstInstance = instances[0];

    // Spy on the ConsoleSender send method
    const sendSpy = vi.spyOn(consoleSender, 'send');

    // 6. Simulate worker firing the schedule.review.due event
    // The EventListener will catch this, retrieve the user, and call notificationService.queue
    const reviewDueEvent = new ScheduleReviewDueEvent(
      firstInstance.id,
      definition.id,
      firstInstance.periodRef,
      new Date(),
    );

    // Emit event via event bus
    eventBus.emit(SCHEDULE_EVENTS.REVIEW_DUE, reviewDueEvent);

    // Give it a brief moment for the event handler and background bullmq worker to execute
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Verify delivery record exists in the DB
    const deliveries = await env.prisma.notificationDelivery.findMany({
      where: { recipientUserId: user.id, templateKey: 'review-due' },
    });

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].templateKey).toBe('review-due');
    expect(deliveries[0].status).toBe(DeliveryStatus.SENT);
    expect(deliveries[0].renderedSubject).toBe('Review Due for 2026-01');
    expect(deliveries[0].renderedBody).toBe(
      'Hello Ahmed, your review for 2026-01 is due.',
    );
    expect(deliveries[0].sentAt).toBeDefined();

    // Verify console sender was indeed triggered
    expect(sendSpy).toHaveBeenCalled();
  });
});
