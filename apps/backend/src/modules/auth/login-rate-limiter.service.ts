import { createHash } from "node:crypto";
import type Redis from "ioredis";

export interface LoginRateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
}

export class LoginRateLimiterService {
  private static readonly consumeScript = `
    local count = redis.call("INCR", KEYS[1])

    if count == 1 then
      redis.call("EXPIRE", KEYS[1], ARGV[1])
    end

    local ttl = redis.call("TTL", KEYS[1])

    return { count, ttl }
  `;

  constructor(
    private readonly redis: Redis,
    private readonly maximumAttempts = 5,
    private readonly windowSeconds = 15 * 60,
  ) {}

  async consume(
    clientIp: string,
    email: string,
  ): Promise<LoginRateLimitResult> {
    const key = this.createKey(clientIp, email);

    const result = await this.redis.eval(
      LoginRateLimiterService.consumeScript,
      1,
      key,
      this.windowSeconds,
    );

    if (!Array.isArray(result)) {
      throw new Error("Unexpected Redis rate-limit response");
    }

    const attemptCount = Number(result[0]);
    const retryAfterSeconds = Math.max(
      Number(result[1]),
      0,
    );

    return {
      allowed: attemptCount <= this.maximumAttempts,
      remainingAttempts: Math.max(
        this.maximumAttempts - attemptCount,
        0,
      ),
      retryAfterSeconds,
    };
  }

  async reset(
    clientIp: string,
    email: string,
  ): Promise<void> {
    await this.redis.del(this.createKey(clientIp, email));
  }

  private createKey(
    clientIp: string,
    email: string,
  ): string {
    const normalizedEmail = email.trim().toLowerCase();

    const identityHash = createHash("sha256")
      .update(`${clientIp}:${normalizedEmail}`)
      .digest("hex");

    return `auth:login:${identityHash}`;
  }
}