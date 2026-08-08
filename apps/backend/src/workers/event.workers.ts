import { PermanentError } from "../errors/app.errors";
import { QUEUE_NAMES } from "../queue/queue.constants";
import type { WorkerDefinition } from "../queue/worker.factory";
import type { EventDispatcherService } from "../events/event-dispatcher.service";
import type { OutboxRelayService } from "../events/outbox-relay.service";
import type { EventDispatchJobData } from "../events/event.types";

export function createOutboxRelayWorker(
  relayService: OutboxRelayService,
): WorkerDefinition {
  return {
    queue: QUEUE_NAMES.eventsRelay,
    // Concurrency 1 keeps a single process from reading the same PENDING batch
    // twice. Across replicas duplicates are still possible and still harmless,
    // because dispatch jobs are deduplicated by job id.
    concurrency: 1,
    async handle() {
      await relayService.relayPendingEvents();
    },
  };
}

export function createEventDispatchWorker(
  dispatcherService: EventDispatcherService,
  concurrency: number,
): WorkerDefinition<EventDispatchJobData> {
  return {
    queue: QUEUE_NAMES.eventsDispatch,
    concurrency,
    async handle(job) {
      const data = job.data;

      if (!data?.subscriberId || !data.envelope) {
        throw new PermanentError("Malformed event dispatch payload", {
          jobId: job.id,
        });
      }

      await dispatcherService.dispatch(data);
    },
  };
}
