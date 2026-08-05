import type Redis from "ioredis";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedSession } from "../../src/modules/auth/session.service";
import { AuthenticationFreshnessService } from "../../src/modules/iam/authentication-freshness.service";

const secret = "test-auth-secret-at-least-32-characters-long";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function session(sessionId: string, overrides: Partial<AuthenticatedSession> = {}): AuthenticatedSession {
  return {
    user: { id: userId, email: "user@example.test", name: null },
    sessionId,
    authenticatedAt: new Date(Date.now() - 600_000),
    expiresAt: new Date(Date.now() + 900_000),
    authenticationMethod: "credentials",
    ...overrides,
  };
}

function harness() {
  const values = new Map<string, string>();
  const set = vi.fn(async (key: string, value: string) => { values.set(key, value); return "OK"; });
  const get = vi.fn(async (key: string) => values.get(key) ?? null);
  const redis = { set, get } as unknown as Redis;
  return { service: new AuthenticationFreshnessService(redis, secret), values, set, get };
}

describe("AuthenticationFreshnessService", () => {
  it("isolates two sessions belonging to the same platform user", async () => {
    const test = harness();
    const sessionA = session("11111111-1111-4111-8111-111111111111");
    const sessionB = session("22222222-2222-4222-8222-222222222222");
    const refreshedAt = new Date();

    await test.service.record(sessionA, refreshedAt);

    expect(await test.service.resolve(sessionA)).toEqual(refreshedAt);
    expect(await test.service.resolve(sessionB)).toEqual(sessionB.authenticatedAt);
    expect(test.values).toHaveLength(1);
  });

  it("does not let a new login inherit an old session override", async () => {
    const test = harness();
    const oldSession = session("11111111-1111-4111-8111-111111111111");
    const newSession = session("33333333-3333-4333-8333-333333333333", {
      authenticatedAt: new Date(),
    });
    await test.service.record(oldSession);
    expect(await test.service.resolve(newSession)).toEqual(newSession.authenticatedAt);
  });

  it("does not read or write freshness for an expired session", async () => {
    const test = harness();
    const expired = session("11111111-1111-4111-8111-111111111111", {
      expiresAt: new Date(Date.now() - 1_000),
    });
    await test.service.record(expired);
    expect(test.set).not.toHaveBeenCalled();
    expect(await test.service.resolve(expired)).toEqual(expired.authenticatedAt);
    expect(test.get).not.toHaveBeenCalled();
  });

  it("uses a bounded HMAC key without raw session or identity material", async () => {
    const test = harness();
    const current = session("11111111-1111-4111-8111-111111111111");
    await test.service.record(current);
    const [key, , expiryMode, ttl] = test.set.mock.calls[0]!;
    expect(key).toMatch(/^iam:authentication-freshness:[a-f0-9]{64}$/);
    expect(key).not.toContain(current.sessionId);
    expect(key).not.toContain(current.user.id);
    expect(key).not.toContain(current.user.email!);
    expect(expiryMode).toBe("EX");
    expect(Number(ttl)).toBeGreaterThan(0);
    expect(Number(ttl)).toBeLessThanOrEqual(900);
  });
});
