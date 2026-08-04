import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  HashChainVerificationService,
  VerificationJobData,
} from '../hash-chain-verification.service';

@Processor('audit-verification-queue')
@Injectable()
export class VerificationWorker extends WorkerHost {
  private readonly logger = new Logger(VerificationWorker.name);

  constructor(
    private readonly verificationService: HashChainVerificationService,
  ) {
    super();
  }

  async process(job: Job<VerificationJobData, any, string>): Promise<any> {
    const { id, data } = job;
    this.logger.debug(`Starting audit verification job ${id || ''}...`);

    const { startDate, endDate } = data || {};
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const report = await this.verificationService.verifyRange(start, end);

    if (report.isValid) {
      this.logger.log(
        `Verification succeeded. Total verified: ${report.totalVerified}`,
      );
    } else {
      this.logger.error(`Verification failed: ${report.error?.message || ''}`);
    }

    return report;
  }
}
