import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { CadenceRepository } from '../cadence.repository';
import { EventBusService } from '../../../common/event-bus/event-bus.service';
import { CadenceStatus } from '@prisma/client';
import {
  ScheduleWindowOpenedEvent,
  ScheduleWindowClosingEvent,
  ScheduleWindowClosedEvent,
  ScheduleReviewDueEvent,
  SCHEDULE_EVENTS,
} from '../events/schedule.events';

@Processor('scheduler-queue')
@Injectable()
export class SchedulerWorker extends WorkerHost {
  private readonly logger = new Logger(SchedulerWorker.name);

  constructor(
    private readonly repository: CadenceRepository,
    private readonly eventBus: EventBusService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    if (job.name === 'check-instances') {
      await this.checkInstances();
    }
  }

  async checkInstances(): Promise<void> {
    const now = new Date();
    this.logger.debug(`Checking cadence instances at ${now.toISOString()}...`);

    // Fetch all active (non-CLOSED) instances
    const activeInstances = await this.repository.getActiveInstances();

    for (const instance of activeInstances) {
      // 1. Check openedAt: transition PENDING -> OPEN
      if (
        instance.status === CadenceStatus.PENDING &&
        now >= instance.openedAt
      ) {
        await this.repository.updateInstanceStatus(
          instance.id,
          CadenceStatus.OPEN,
        );
        this.eventBus.emit(
          SCHEDULE_EVENTS.WINDOW_OPENED,
          new ScheduleWindowOpenedEvent(
            instance.id,
            instance.cadenceDefinitionId,
            instance.periodRef,
            now,
          ),
        );
        this.logger.log(
          `Instance ${instance.id} (${instance.periodRef}) OPENED.`,
        );
      }

      // 2. Check dueAt: emit schedule.review.due if not already emitted
      if (!instance.dueEventEmitted && now >= instance.dueAt) {
        await this.repository.markDueEventEmitted(instance.id);
        this.eventBus.emit(
          SCHEDULE_EVENTS.REVIEW_DUE,
          new ScheduleReviewDueEvent(
            instance.id,
            instance.cadenceDefinitionId,
            instance.periodRef,
            now,
          ),
        );
        this.logger.log(
          `Instance ${instance.id} (${instance.periodRef}) REVIEW DUE.`,
        );
      }

      // 3. Check closingAt: transition OPEN -> CLOSING
      if (instance.status === CadenceStatus.OPEN && now >= instance.closingAt) {
        await this.repository.updateInstanceStatus(
          instance.id,
          CadenceStatus.CLOSING,
        );
        this.eventBus.emit(
          SCHEDULE_EVENTS.WINDOW_CLOSING,
          new ScheduleWindowClosingEvent(
            instance.id,
            instance.cadenceDefinitionId,
            instance.periodRef,
            now,
          ),
        );
        this.logger.log(
          `Instance ${instance.id} (${instance.periodRef}) CLOSING.`,
        );
      }

      // 4. Check closedAt: transition CLOSING -> CLOSED
      if (
        instance.status === CadenceStatus.CLOSING &&
        now >= instance.closedAt
      ) {
        await this.repository.updateInstanceStatus(
          instance.id,
          CadenceStatus.CLOSED,
        );
        this.eventBus.emit(
          SCHEDULE_EVENTS.WINDOW_CLOSED,
          new ScheduleWindowClosedEvent(
            instance.id,
            instance.cadenceDefinitionId,
            instance.periodRef,
            now,
          ),
        );
        this.logger.log(
          `Instance ${instance.id} (${instance.periodRef}) CLOSED.`,
        );
      }
    }
  }
}
