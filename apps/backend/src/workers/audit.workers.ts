import { PermanentError } from "../errors/app.errors";
import type { Logger } from "../logging/logger";
import {
  JOB_NAMES,
  QUEUE_NAMES,
} from "../queue/queue.constants";
import type { WorkerDefinition } from "../queue/worker.factory";
import type { JournalService } from "../modules/audit/journal.service";

export function createAuditVerificationWorker(
  journal: JournalService,
  logger: Logger,
): WorkerDefinition {
  return {
    queue: QUEUE_NAMES.auditVerification,
    concurrency: 1,

    async handle(job) {
      if (job.name !== JOB_NAMES.verifyAuditChain) {
        throw new PermanentError(
          "Unexpected audit verification job",
          {
            jobId: job.id,
            jobName: job.name,
          },
        );
      }

      const result = await journal.verifyChain();

      if (!result.valid) {
        const details = {
          checkedEntries: result.checkedEntries,
          brokenSequenceNumber:
            result.brokenSequenceNumber?.toString() ?? null,
          brokenEntryId: result.brokenEntryId,
          reason: result.reason,
        };

        logger.error(
          "Audit journal hash chain verification failed",
          details,
        );

        throw new PermanentError(
          "Audit journal hash chain verification failed",
          details,
        );
      }

      logger.info(
        "Audit journal hash chain verified",
        {
          checkedEntries: result.checkedEntries,
        },
      );
    },
  };
}
