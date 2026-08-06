import type { Logger } from "../logging/logger";
import { PermanentError } from "../errors/app.errors";
import type { EventSubscriberRegistry } from "./event-subscriber.registry";
import type { EventDispatchJobData } from "./event.types";

/**
 * Invokes exactly one subscriber for one event. Keeping the fan-out at the
 * queue level rather than inside a single job means a subscriber that keeps
 * failing exhausts only its own retries — the other subscribers of the same
 * event are unaffected.
 */
export class EventDispatcherService {
  constructor(
    private readonly subscriberRegistry: EventSubscriberRegistry,
    private readonly logger: Logger,
  ) {}

  async dispatch(jobData: EventDispatchJobData): Promise<void> {
    const subscriber = this.subscriberRegistry.findById(jobData.subscriberId);

    if (!subscriber) {
      // A subscriber that was removed between enqueue and dispatch. Retrying
      // cannot bring it back, so fail permanently and keep the record.
      throw new PermanentError("Unknown event subscriber", {
        subscriberId: jobData.subscriberId,
        eventId: jobData.eventId,
      });
    }

    await subscriber.handle(jobData.envelope);

    this.logger.debug("Event dispatched to subscriber", {
      eventId: jobData.eventId,
      eventType: jobData.envelope.eventType,
      subscriberId: subscriber.id,
    });
  }
}
