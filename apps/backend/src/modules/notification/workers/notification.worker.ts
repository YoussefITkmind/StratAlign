import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from '../notification.service';

@Processor('notification-queue')
@Injectable()
export class NotificationWorker extends WorkerHost {
  private readonly logger = new Logger(NotificationWorker.name);

  constructor(private readonly notificationService: NotificationService) {
    super();
  }

  async process(job: Job<{ deliveryId: string }, void, string>): Promise<void> {
    if (job.name === 'send-notification') {
      const { deliveryId } = job.data;
      this.logger.debug(`Processing notification delivery ${deliveryId}...`);
      await this.notificationService.send(deliveryId);
    }
  }
}
