import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupTestEnvironment, TestEnvironment } from './db-test-helper';
import { ConsoleSender } from '../src/modules/notification/senders/console.sender';
import { EmailSender } from '../src/modules/notification/senders/email.sender';
import { TeamsSender } from '../src/modules/notification/senders/teams.sender';
import { NotificationService } from '../src/modules/notification/notification.service';
import { TemplateRendererService } from '../src/modules/notification/template-renderer.service';
import { DeliveryStatus, Locale, NotificationChannel } from '@prisma/client';
import { Queue } from 'bullmq';

describe('Notification Senders & Failure Handling', () => {
  let env: TestEnvironment;

  const mockQueue = {
    add: vi.fn(),
  } as unknown as Queue;

  beforeAll(async () => {
    env = await setupTestEnvironment();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it('ConsoleSender should log messages successfully', async () => {
    const sender = new ConsoleSender();
    // Simply expect the promise to resolve without throwing
    await expect(
      sender.send({
        recipient: 'test@example.com',
        subject: 'Hello',
        body: 'World',
      }),
    ).resolves.not.toThrow();
  });

  it('EmailSender mock mode should execute successfully', async () => {
    const sender = new EmailSender();
    await expect(
      sender.send({
        recipient: 'test@example.com',
        subject: 'Hello',
        body: 'World',
      }),
    ).resolves.not.toThrow();
  });

  it('TeamsSender mock mode should execute successfully', async () => {
    const sender = new TeamsSender();
    await expect(
      sender.send({
        recipient: 'mock-teams-webhook',
        subject: 'Hello',
        body: 'World',
      }),
    ).resolves.not.toThrow();
  });

  it('Failure tests: should increment retries and set status to FAILED on sender failure', async () => {
    // 1. Create a user
    const user = await env.prisma.user.create({
      data: {
        name: 'Ahmed',
        email: 'ahmed-fail@example.com',
        preferredLocale: Locale.EN,
      },
    });

    // 2. Create template
    await env.prisma.notificationTemplate.create({
      data: {
        key: 'test-fail-key',
        channel: NotificationChannel.EMAIL,
        subjectEn: 'Fail Sub',
        subjectAr: 'Fail Sub Ar',
        bodyEn: 'Fail Body',
        bodyAr: 'Fail Body Ar',
        digestible: false,
      },
    });

    // 3. Create a delivery
    const delivery = await env.prisma.notificationDelivery.create({
      data: {
        templateKey: 'test-fail-key',
        recipientUserId: user.id,
        channel: NotificationChannel.EMAIL,
        renderedSubject: 'Fail Sub',
        renderedBody: 'Fail Body',
        status: DeliveryStatus.QUEUED,
        retries: 0,
      },
    });

    // Force a sender failure by mocking consoleSender.send to throw
    const badConsoleSender = new ConsoleSender();
    vi.spyOn(badConsoleSender, 'send').mockRejectedValue(
      new Error('Console Sender Failure'),
    );

    // Reconstruct service with failing sender
    const failingService = new NotificationService(
      env.prisma,
      new TemplateRendererService(),
      badConsoleSender,
      new EmailSender(),
      new TeamsSender(),
      mockQueue,
    );

    // Act & Assert: we expect the send call to fail
    await expect(failingService.send(delivery.id)).rejects.toThrow(
      'Console Sender Failure',
    );

    // Verify delivery status is updated to FAILED and retries is incremented
    const updatedDelivery = await env.prisma.notificationDelivery.findUnique({
      where: { id: delivery.id },
    });

    expect(updatedDelivery?.status).toBe(DeliveryStatus.FAILED);
    expect(updatedDelivery?.retries).toBe(1);
  });
});
