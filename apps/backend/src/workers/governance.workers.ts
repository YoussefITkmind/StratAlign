import type {
  WorkerDefinition,
} from "../queue/worker.factory";

import {
  JOB_NAMES,
  QUEUE_NAMES,
} from "../queue/queue.constants";

import type {
  GovernanceEscalationService,
  RaiseEscalationInput,
} from "../modules/governance/governance-escalation.service";

export function createGovernanceEscalationWorker(
  service: GovernanceEscalationService,
  concurrency: number,
): WorkerDefinition<RaiseEscalationInput> {
  return {
    queue:
      QUEUE_NAMES.governanceEscalation,

    concurrency,

    async handle(job) {
      if (
        job.name !==
        JOB_NAMES.raiseGovernanceEscalation
      ) {
        throw new Error(
          `Unsupported governance escalation job: ${job.name}`,
        );
      }

      await service.raise(job.data);
    },
  };
}
