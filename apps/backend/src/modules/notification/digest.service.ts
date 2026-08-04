import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConsoleSender } from './senders/console.sender';
import { EmailSender } from './senders/email.sender';
import { TeamsSender } from './senders/teams.sender';
import { NotificationSender } from './senders/sender.interface';
import { DeliveryStatus, NotificationChannel, Locale } from '@prisma/client';

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly consoleSender: ConsoleSender,
    private readonly emailSender: EmailSender,
    private readonly teamsSender: TeamsSender,
  ) {}

  /**
   * Scans queued notifications, groups digestible ones by recipient, and sends summaries.
   */
  async processDigests(): Promise<void> {
    this.logger.log('Starting digest compilation...');

    // Fetch all QUEUED deliveries
    const queuedDeliveries = await this.prisma.notificationDelivery.findMany({
      where: {
        status: DeliveryStatus.QUEUED,
      },
    });

    // Filter by digestible templates
    const digestibleTemplates = await this.prisma.notificationTemplate.findMany(
      {
        where: { digestible: true },
        select: { key: true },
      },
    );
    const digestibleKeys = new Set(digestibleTemplates.map((t) => t.key));

    const targetDeliveries = queuedDeliveries.filter((d) =>
      digestibleKeys.has(d.templateKey),
    );

    if (targetDeliveries.length === 0) {
      this.logger.log('No digestible notifications queued.');
      return;
    }

    // Group by recipientUserId and channel
    const groups: Record<string, typeof targetDeliveries> = {};
    for (const delivery of targetDeliveries) {
      const groupKey = `${delivery.recipientUserId}:${delivery.channel}`;
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(delivery);
    }

    // Compile and send summaries
    for (const [groupKey, deliveries] of Object.entries(groups)) {
      const [userId, channelStr] = groupKey.split(':');
      const channel = channelStr as NotificationChannel;

      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) continue;

      // Group bodies into a summary
      const lines = deliveries.map(
        (d, index) => `${index + 1}. ${d.renderedSubject}: ${d.renderedBody}`,
      );
      const body = lines.join('\n');

      const isArabic = user.preferredLocale === Locale.AR;
      const subject = isArabic ? 'ملخص الساعة' : 'Hourly Summary';

      let recipient = user.email;
      if (channel === NotificationChannel.TEAMS) {
        recipient = process.env.TEAMS_WEBHOOK_URL || 'mock-teams-webhook-url';
      }

      // Determine sender
      const useConsole =
        process.env.NODE_ENV === 'test' ||
        process.env.USE_CONSOLE_SENDER === 'true';
      let sender: NotificationSender = this.consoleSender;

      if (!useConsole) {
        if (channel === NotificationChannel.EMAIL) {
          sender = this.emailSender;
        } else if (channel === NotificationChannel.TEAMS) {
          sender = this.teamsSender;
        }
      }

      try {
        await sender.send({
          recipient,
          subject,
          body,
        });

        // Mark individual deliveries as SENT
        const deliveryIds = deliveries.map((d) => d.id);
        await this.prisma.notificationDelivery.updateMany({
          where: {
            id: { in: deliveryIds },
          },
          data: {
            status: DeliveryStatus.SENT,
            sentAt: new Date(),
          },
        });

        this.logger.log(
          `Sent digest to user ${user.id} containing ${deliveries.length} items.`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to send digest to user ${user.id}: ${(error as Error).message}`,
        );
        // Handle failure: increment retries and update status
        const deliveryIds = deliveries.map((d) => d.id);
        for (const id of deliveryIds) {
          const d = deliveries.find((x) => x.id === id);
          if (d) {
            const nextRetries = d.retries + 1;
            const finalStatus =
              nextRetries >= 3 ? DeliveryStatus.FAILED : DeliveryStatus.QUEUED;
            await this.prisma.notificationDelivery.update({
              where: { id },
              data: {
                status: finalStatus,
                retries: nextRetries,
              },
            });
          }
        }
      }
    }
  }
}
