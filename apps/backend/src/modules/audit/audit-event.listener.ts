import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JournalService } from './journal.service';
import { SnapshotService } from './snapshot.service';
import {
  ScheduleEventPayload,
  SCHEDULE_EVENTS,
} from '../scheduler/events/schedule.events';

@Injectable()
export class AuditEventListener {
  private readonly logger = new Logger(AuditEventListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly journalService: JournalService,
    private readonly snapshotService: SnapshotService,
  ) {}

  @OnEvent(SCHEDULE_EVENTS.WINDOW_OPENED)
  async handleWindowOpened(event: ScheduleEventPayload): Promise<void> {
    await this.auditScheduleEvent('WINDOW_OPENED', event);
  }

  @OnEvent(SCHEDULE_EVENTS.REVIEW_DUE)
  async handleReviewDue(event: ScheduleEventPayload): Promise<void> {
    await this.auditScheduleEvent('REVIEW_DUE', event);
  }

  @OnEvent(SCHEDULE_EVENTS.WINDOW_CLOSING)
  async handleWindowClosing(event: ScheduleEventPayload): Promise<void> {
    await this.auditScheduleEvent('WINDOW_CLOSING', event);
  }

  @OnEvent(SCHEDULE_EVENTS.WINDOW_CLOSED)
  async handleWindowClosed(event: ScheduleEventPayload): Promise<void> {
    await this.auditScheduleEvent('WINDOW_CLOSED', event);
  }

  /**
   * Core audit logic shared across all scheduler events.
   * Creates a journal entry and snapshots the CadenceInstance state atomically.
   */
  private async auditScheduleEvent(
    action: string,
    event: ScheduleEventPayload,
  ): Promise<void> {
    try {
      // 1. Create the journal entry (hash-chained)
      const journalEntry = await this.journalService.createEntry({
        action,
        entityType: 'CadenceInstance',
        entityId: event.instanceId,
        metadata: {
          cadenceDefinitionId: event.cadenceDefinitionId,
          periodRef: event.periodRef,
          eventTime: event.eventTime.toISOString(),
        },
      });

      // 2. Snapshot the current CadenceInstance state
      const instance = await this.prisma.cadenceInstance.findUnique({
        where: { id: event.instanceId },
      });

      if (instance) {
        await this.prisma.$transaction(async (tx) => {
          await this.snapshotService.createSnapshot(
            tx,
            journalEntry.id,
            'CadenceInstance',
            instance.id,
            {
              cadenceDefinitionId: instance.cadenceDefinitionId,
              periodRef: instance.periodRef,
              status: instance.status,
              dueAt: instance.dueAt.toISOString(),
              openedAt: instance.openedAt.toISOString(),
              closingAt: instance.closingAt.toISOString(),
              closedAt: instance.closedAt.toISOString(),
            },
          );
        });
      }

      this.logger.log(
        `Audited ${action} for CadenceInstance ${event.instanceId}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to audit ${action} for instance ${event.instanceId}: ${(err as Error).message}`,
      );
    }
  }
}
