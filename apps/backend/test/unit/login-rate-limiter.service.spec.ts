import type Redis from "ioredis";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { LoginRateLimiterService } from "../../src/modules/auth/login-rate-limiter.service";

describe("LoginRateLimiterService", () => {
  const evaluate = vi.fn();
  const remove = vi.fn();

  const redis = {
    eval: evaluate,
    del: remove,
  } as unknown as Redis;

  let attemptCount: number;
  let rateLimiter: LoginRateLimiterService;

  beforeEach(() => {
    attemptCount = 0;
    evaluate.mockReset();
    remove.mockReset();

    evaluate.mockImplementation(() => {
      attemptCount += 1;
      return Promise.resolve([attemptCount, 900]);
    });

    remove.mockResolvedValue(1);

    rateLimiter = new LoginRateLimiterService(
      redis,
      5,
      900,
    );
  });

  it("allows the first five attempts", async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await rateLimiter.consume(
        "127.0.0.1",
        "alice@example.test",
      );

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(5 - attempt);
    }
  });

  it("blocks the sixth attempt", async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await rateLimiter.consume(
        "127.0.0.1",
        "alice@example.test",
      );
    }

    const result = await rateLimiter.consume(
      "127.0.0.1",
      "alice@example.test",
    );

    expect(result).toEqual({
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds: 900,
    });
  });

  it("resets the counter without exposing the email in the key", async () => {
    await rateLimiter.reset(
      "127.0.0.1",
      "alice@example.test",
    );

    expect(remove).toHaveBeenCalledOnce();

    const redisKey = remove.mock.calls[0]?.[0];

    expect(redisKey).toMatch(/^auth:login:[a-f0-9]{64}$/);
    expect(redisKey).not.toContain("alice@example.test");
  });
});