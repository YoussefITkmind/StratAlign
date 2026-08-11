import { QUEUE_NAMES } from "../../queue/queue.constants";
import type { WorkerDefinition } from "../../queue/worker.factory";
import type { DomainEventEnvelope } from "../../events/event.types";
import { PerformanceRecomputeSubscriber } from "./recompute.worker";

export function createPerformanceRecomputeWorker(
  subscriber: PerformanceRecomputeSubscriber,
): WorkerDefinition {
  return {
    queue: QUEUE_NAMES.performanceRecompute,
    concurrency: 5,
    async handle(job) {
      const envelope = job.data as DomainEventEnvelope<Record<string, unknown>>;
      await subscriber.handle(envelope);
    },
  };
}
