import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { DigestService } from '../digest.service';

@Processor('digest-queue')
@Injectable()
export class DigestWorker extends WorkerHost {
  private readonly logger = new Logger(DigestWorker.name);

  constructor(private readonly digestService: DigestService) {
    super();
  }

  async process(job: Job<unknown, void, string>): Promise<void> {
    if (job.name === 'compile-digests') {
      this.logger.debug('Running batch digest processing...');
      await this.digestService.processDigests();
    }
  }
}
