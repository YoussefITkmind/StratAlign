import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationService } from './notification.service';
import { TemplateRendererService } from './template-renderer.service';
import { DigestService } from './digest.service';
import { ConsoleSender } from './senders/console.sender';
import { EmailSender } from './senders/email.sender';
import { TeamsSender } from './senders/teams.sender';
import { NotificationWorker } from './workers/notification.worker';
import { DigestWorker } from './workers/digest.worker';
import { NotificationEventListener } from './notification-event.listener';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'notification-queue' },
      { name: 'digest-queue' },
    ),
  ],
  providers: [
    NotificationService,
    TemplateRendererService,
    DigestService,
    ConsoleSender,
    EmailSender,
    TeamsSender,
    NotificationWorker,
    DigestWorker,
    NotificationEventListener,
  ],
  exports: [NotificationService, DigestService],
})
export class NotificationModule implements OnApplicationBootstrap {
  constructor(
    @InjectQueue('digest-queue') private readonly digestQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    // Clean up existing repeatable jobs
    const jobs = await this.digestQueue.getRepeatableJobs();
    for (const job of jobs) {
      await this.digestQueue.removeRepeatableByKey(job.key);
    }

    // Schedule hourly digest compilation job
    await this.digestQueue.add(
      'compile-digests',
      {},
      {
        repeat: {
          pattern: '0 * * * *', // Hourly cron
        },
      },
    );
  }
}
