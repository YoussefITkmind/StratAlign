import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { JournalService } from '../journal.service';

export interface OutboxJobData {
  action: string;
  entityType: string;
  entityId: string;
  userId?: string | null;
  metadata?: Record<string, any> | null;
}

@Processor('outbox-queue')
@Injectable()
export class OutboxWorker extends WorkerHost {
  private readonly logger = new Logger(OutboxWorker.name);

  constructor(private readonly journalService: JournalService) {
    super();
  }

  async process(job: Job<OutboxJobData, any, string>): Promise<void> {
    const { id, name, data } = job;
    this.logger.debug(`Processing outbox job ${id || ''} (name: ${name})...`);

    if (!data || !data.action || !data.entityType || !data.entityId) {
      this.logger.error(`Invalid outbox payload: ${JSON.stringify(data)}`);
      return;
    }

    await this.journalService.createEntry({
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      userId: data.userId || null,
      metadata: data.metadata || null,
    });
  }
}
