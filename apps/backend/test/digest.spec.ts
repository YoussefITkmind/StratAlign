import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupTestEnvironment, TestEnvironment } from './db-test-helper';
import { ConsoleSender } from '../src/modules/notification/senders/console.sender';
import { EmailSender } from '../src/modules/notification/senders/email.sender';
import { TeamsSender } from '../src/modules/notification/senders/teams.sender';
import { DigestService } from '../src/modules/notification/digest.service';
import { DeliveryStatus, Locale, NotificationChannel } from '@prisma/client';

describe('Notification Digest System', () => {
  let env: TestEnvironment;
  let digestService: DigestService;
  let mockConsoleSender: ConsoleSender;

  beforeAll(async () => {
    env = await setupTestEnvironment();
    mockConsoleSender = new ConsoleSender();
    digestService = new DigestService(
      env.prisma,
      mockConsoleSender,
      new EmailSender(),
      new TeamsSender(),
    );
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it('should group 3 digestible notifications for a single user and send 1 digest', async () => {
    // 1. Create recipient user
    const user = await env.prisma.user.create({
      data: {
        name: 'Ahmed',
        email: 'ahmed-digest@example.com',
        preferredLocale: Locale.EN,
      },
    });

    // 2. Create digestible templates
    await env.prisma.notificationTemplate.createMany({
      data: [
        {
          key: 'review-due-key',
          channel: NotificationChannel.EMAIL,
          subjectEn: 'Review Due',
          subjectAr: 'Review Due',
          bodyEn: 'Your review for January is due.',
          bodyAr: 'Your review for January is due.',
          digestible: true,
        },
        {
          key: 'kpi-reminder-key',
          channel: NotificationChannel.EMAIL,
          subjectEn: 'KPI Reminder',
          subjectAr: 'KPI Reminder',
          bodyEn: 'Please update your KPIs.',
          bodyAr: 'Please update your KPIs.',
          digestible: true,
        },
        {
          key: 'window-closing-key',
          channel: NotificationChannel.EMAIL,
          subjectEn: 'Window Closing',
          subjectAr: 'Window Closing',
          bodyEn: 'Review window is closing in 2 days.',
          bodyAr: 'Review window is closing in 2 days.',
          digestible: true,
        },
      ],
    });
    // 3. Create 3 queued deliveries (in immediate queue but marked digestible)
    await env.prisma.notificationDelivery.createMany({
      data: [
        {
          templateKey: 'review-due-key',
          recipientUserId: user.id,
          channel: NotificationChannel.EMAIL,
          renderedSubject: 'Review Due',
          renderedBody: 'Your review for January is due.',
          status: DeliveryStatus.QUEUED,
        },
        {
          templateKey: 'kpi-reminder-key',
          recipientUserId: user.id,
          channel: NotificationChannel.EMAIL,
          renderedSubject: 'KPI Reminder',
          renderedBody: 'Please update your KPIs.',
          status: DeliveryStatus.QUEUED,
        },
        {
          templateKey: 'window-closing-key',
          recipientUserId: user.id,
          channel: NotificationChannel.EMAIL,
          renderedSubject: 'Window Closing',
          renderedBody: 'Review window is closing in 2 days.',
          status: DeliveryStatus.QUEUED,
        },
      ],
    });

    // Spy on the console sender's send method
    const sendSpy = vi.spyOn(mockConsoleSender, 'send');

    // 4. Act: run the digest process
    await digestService.processDigests();

    // 5. Assert: 1 send call should be made compiling all 3 notifications
    expect(sendSpy).toHaveBeenCalledTimes(1);

    const callArgs = sendSpy.mock.calls[0][0];
    expect(callArgs.recipient).toBe('ahmed-digest@example.com');
    expect(callArgs.subject).toBe('Hourly Summary');
    expect(callArgs.body).toContain(
      '1. Review Due: Your review for January is due.',
    );
    expect(callArgs.body).toContain(
      '2. KPI Reminder: Please update your KPIs.',
    );
    expect(callArgs.body).toContain(
      '3. Window Closing: Review window is closing in 2 days.',
    );

    // 6. Verify individual deliveries status updated to SENT
    const updatedDeliveries = await env.prisma.notificationDelivery.findMany({
      where: { recipientUserId: user.id },
    });

    expect(updatedDeliveries).toHaveLength(3);
    for (const d of updatedDeliveries) {
      expect(d.status).toBe(DeliveryStatus.SENT);
      expect(d.sentAt).toBeDefined();
    }
  });
});
