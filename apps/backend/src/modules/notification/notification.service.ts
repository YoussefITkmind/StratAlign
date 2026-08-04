import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TemplateRendererService } from './template-renderer.service';
import { ConsoleSender } from './senders/console.sender';
import { EmailSender } from './senders/email.sender';
import { TeamsSender } from './senders/teams.sender';
import { NotificationSender } from './senders/sender.interface';
import {
  NotificationDelivery,
  DeliveryStatus,
  NotificationChannel,
} from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: TemplateRendererService,
    private readonly consoleSender: ConsoleSender,
    private readonly emailSender: EmailSender,
    private readonly teamsSender: TeamsSender,
    @InjectQueue('notification-queue')
    private readonly notificationQueue: Queue,
  ) {}

  /**
   * Prepares a notification from template, renders it for user, and queues it.
   */
  async queue(
    templateKey: string,
    recipientUserId: string,
    variables: Record<string, unknown>,
  ): Promise<NotificationDelivery> {
    const user = await this.prisma.user.findUnique({
      where: { id: recipientUserId },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${recipientUserId} not found`);
    }

    const template = await this.prisma.notificationTemplate.findUnique({
      where: { key: templateKey },
    });
    if (!template) {
      throw new NotFoundException(`Template with key ${templateKey} not found`);
    }

    // Render localized subject and body
    const { subject, body } = this.renderer.render(
      template,
      user.preferredLocale,
      variables,
    );

    // Create NotificationDelivery row
    const delivery = await this.prisma.notificationDelivery.create({
      data: {
        templateKey,
        recipientUserId,
        channel: template.channel,
        renderedSubject: subject,
        renderedBody: body,
        status: DeliveryStatus.QUEUED,
        retries: 0,
      },
    });

    // If digestible, do NOT send immediately
    if (template.digestible) {
      return delivery;
    }

    // Add to BullMQ queue for immediate execution
    await this.notificationQueue.add('send-notification', {
      deliveryId: delivery.id,
    });

    return delivery;
  }

  /**
   * Executes the actual sending process.
   */
  async send(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      include: { recipientUser: true },
    });

    if (!delivery) {
      throw new NotFoundException(`Delivery with ID ${deliveryId} not found`);
    }

    let recipient = delivery.recipientUser.email;
    if (delivery.channel === NotificationChannel.TEAMS) {
      // Standard webhook URL fallback
      recipient = process.env.TEAMS_WEBHOOK_URL || 'mock-teams-webhook-url';
    }

    // Determine sender based on configuration and channel
    const useConsole =
      process.env.NODE_ENV === 'test' ||
      process.env.USE_CONSOLE_SENDER === 'true';
    let sender: NotificationSender = this.consoleSender;

    if (!useConsole) {
      if (delivery.channel === NotificationChannel.EMAIL) {
        sender = this.emailSender;
      } else if (delivery.channel === NotificationChannel.TEAMS) {
        sender = this.teamsSender;
      }
    }

    try {
      await sender.send({
        recipient,
        subject: delivery.renderedSubject,
        body: delivery.renderedBody,
      });
      await this.markSent(deliveryId);
    } catch (error) {
      await this.markFailed(deliveryId);
      throw error;
    }
  }

  async markSent(id: string): Promise<NotificationDelivery> {
    return this.prisma.notificationDelivery.update({
      where: { id },
      data: {
        status: DeliveryStatus.SENT,
        sentAt: new Date(),
      },
    });
  }

  async markFailed(id: string): Promise<NotificationDelivery> {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id },
    });
    if (!delivery) {
      throw new NotFoundException(`Delivery with ID ${id} not found`);
    }

    const nextRetries = delivery.retries + 1;

    const updated = await this.prisma.notificationDelivery.update({
      where: { id },
      data: {
        status: DeliveryStatus.FAILED,
        retries: nextRetries,
      },
    });

    // Re-enqueue if retries are not exhausted
    if (nextRetries < 3) {
      await this.notificationQueue.add(
        'send-notification',
        { deliveryId: id },
        { delay: 1000 }, // 1 second delay for test execution speed
      );
    }

    return updated;
  }
}
