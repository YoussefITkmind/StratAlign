import type { ConnectionOptions } from "bullmq";

/**
 * Supplies connection options to BullMQ rather than a live client.
 *
 * BullMQ bundles its own major version of ioredis, which is not the one
 * `RedisService` uses. Handing it our client would mean passing an object
 * across that version boundary and hoping the internals line up. Giving it
 * connection options instead lets BullMQ build connections with the ioredis it
 * was tested against, and keeps application Redis use fully separate from
 * queue Redis use.
 *
 * That separation is wanted anyway: workers issue blocking commands that would
 * otherwise stall health checks sharing the same socket.
 */
export class QueueConnectionProvider {
  constructor(private readonly redisUrl: string) {}

  /**
   * `maxRetriesPerRequest: null` is required by BullMQ — it matches what
   * `RedisService` already configures, so both halves behave alike.
   */
  forConnection(connectionName: string): ConnectionOptions {
    return {
      url: this.redisUrl,
      connectionName,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }
}
