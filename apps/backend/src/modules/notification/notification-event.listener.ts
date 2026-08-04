import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationService } from './notification.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ScheduleReviewDueEvent,
  SCHEDULE_EVENTS,
} from '../scheduler/events/schedule.events';

@Injectable()
export class NotificationEventListener {
  private readonly logger = new Logger(NotificationEventListener.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(SCHEDULE_EVENTS.REVIEW_DUE)
  async handleReviewDue(event: ScheduleReviewDueEvent) {
    this.logger.log(
      `Received review due event for instance ${event.instanceId}`,
    );

    // In our end-to-end and integration flow, we resolve all users in the system
    // and queue the 'review-due' template notification for them.
    const users = await this.prisma.user.findMany();

    for (const user of users) {
      try {
        await this.notificationService.queue('review-due', user.id, {
          name: user.name,
          period: event.periodRef,
        });
      } catch (err) {
        this.logger.error(
          `Failed to queue notification for user ${user.id}: ${(err as Error).message}`,
        );
      }
    }
  }
}
