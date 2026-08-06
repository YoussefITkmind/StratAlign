/**
 * Queue names are namespaced `<domain>.<action>`. Every queue is created with
 * the configured QUEUE_PREFIX so several environments can share one Redis
 * instance without colliding — CI in particular runs against a shared service
 * container.
 */
export const QUEUE_NAMES = {
  schedulerTick: "scheduler.tick",
  schedulerMaterialize: "scheduler.materialize",
  schedulerTransition: "scheduler.transition",
  eventsRelay: "events.relay",
  eventsDispatch: "events.dispatch",
  notificationDelivery: "notification.delivery",
  notificationDigest: "notification.digest",
  deadLetter: "dead-letter",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const JOB_NAMES = {
  schedulerTick: "scheduler.tick",
  materializeDefinition: "scheduler.materialize-definition",
  advanceInstance: "scheduler.advance-instance",
  relayOutbox: "events.relay-outbox",
  dispatchEvent: "events.dispatch-event",
  deliverNotification: "notification.deliver",
  sweepDigests: "notification.sweep-digests",
  deadLetter: "dead-letter.record",
} as const;

/**
 * Repeatable jobs carry fixed identifiers so that running N worker replicas
 * still produces exactly one scheduled job per interval rather than N.
 */
export const REPEATABLE_JOB_IDS = {
  schedulerTick: "scheduler-tick",
  eventsRelay: "events-relay",
  digestSweep: "digest-sweep",
} as const;

/**
 * Builds a custom BullMQ job id from its parts.
 *
 * BullMQ rejects a custom job id containing ":" unless it happens to split
 * into exactly three segments — a compatibility carve-out for its own legacy
 * repeatable-job keys, which its source flags for removal in the next breaking
 * change. Colons are therefore avoided entirely rather than relying on that
 * accident, and every job id in the codebase is built here so the rule lives
 * in one place.
 *
 * A purely numeric id is also rejected by BullMQ, which the "kind" prefix on
 * every call site already prevents.
 */
export function buildJobId(
  kind: string,
  ...segments: Array<string | number>
): string {
  return [kind, ...segments]
    .map((segment) => String(segment).replaceAll(":", "_"))
    .join("--");
}
