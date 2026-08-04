import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { CadenceGeneratorService } from './cadence-generator.service';
import { CadenceRepository } from './cadence.repository';
import { SchedulerWorker } from './workers/scheduler.worker';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'scheduler-queue',
    }),
  ],
  controllers: [SchedulerController],
  providers: [
    SchedulerService,
    CadenceGeneratorService,
    CadenceRepository,
    SchedulerWorker,
  ],
  exports: [SchedulerService],
})
export class SchedulerModule implements OnApplicationBootstrap {
  constructor(
    @InjectQueue('scheduler-queue') private readonly schedulerQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    // Clean up existing repeatable jobs to avoid duplicates in development
    const jobs = await this.schedulerQueue.getRepeatableJobs();
    for (const job of jobs) {
      await this.schedulerQueue.removeRepeatableByKey(job.key);
    }

    if (process.env.NODE_ENV !== 'test') {
      // Add repeatable job to check instances every minute
      await this.schedulerQueue.add(
        'check-instances',
        {},
        {
          repeat: {
            pattern: '* * * * *', // Every minute
          },
        },
      );
    }
  }
}
