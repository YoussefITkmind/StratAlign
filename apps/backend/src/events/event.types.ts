/**
 * The event transport is domain-agnostic: it moves envelopes with an opaque
 * `payload` and never inspects them. Producers own payload shape, subscribers
 * own interpretation.
 */

export interface DomainEventEnvelope<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  eventId: string;
  eventType: string;
  /** Bumped when a payload shape changes incompatibly, so subscribers can
   * branch instead of breaking. */
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  payload: TPayload;
}

/** What a producer hands to the event bus, before it becomes an outbox row. */
export interface EventPublicationRequest<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  eventType: string;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  /**
   * Producer-supplied idempotency key. A replayed producer computes the same
   * key, the unique index rejects the duplicate, and no second event escapes.
   */
  dedupeKey: string;
  occurredAt?: Date;
  payload: TPayload;
}

/**
 * Delivery is at-least-once, so `handle` must be idempotent. The dispatcher
 * dedupes on `${eventId}:${subscriberId}` for the retention window, but a
 * subscriber cannot rely on that alone.
 */
export interface EventSubscriber {
  /** Stable across deploys — it is part of the dispatch job identity. */
  readonly id: string;
  readonly eventTypes: readonly string[];
  handle(envelope: DomainEventEnvelope): Promise<void>;
}

export interface EventDispatchJobData {
  eventId: string;
  subscriberId: string;
  envelope: DomainEventEnvelope;
}
