import type { EventSubscriber } from "./event.types";

/**
 * In-process routing table from event type to interested subscribers.
 *
 * This is the extension point the scheduler's genericity depends on: a future
 * KPI or OKR module registers here and filters on its own `subjectType`. The
 * scheduler never learns that those modules exist.
 */
export class EventSubscriberRegistry {
  private readonly byEventType = new Map<string, EventSubscriber[]>();
  private readonly byId = new Map<string, EventSubscriber>();

  register(subscriber: EventSubscriber): void {
    if (this.byId.has(subscriber.id)) {
      throw new Error(
        `Event subscriber "${subscriber.id}" is already registered`,
      );
    }

    this.byId.set(subscriber.id, subscriber);

    for (const eventType of subscriber.eventTypes) {
      const existing = this.byEventType.get(eventType) ?? [];
      existing.push(subscriber);
      this.byEventType.set(eventType, existing);
    }
  }

  subscribersFor(eventType: string): readonly EventSubscriber[] {
    return this.byEventType.get(eventType) ?? [];
  }

  findById(subscriberId: string): EventSubscriber | undefined {
    return this.byId.get(subscriberId);
  }

  all(): readonly EventSubscriber[] {
    return [...this.byId.values()];
  }
}
