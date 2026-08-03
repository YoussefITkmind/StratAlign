import Redis from "ioredis";

export class RedisService {
  private readonly client: Redis;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  getClient(): Redis {
    return this.client;
  }
}