import { appRouter, protectedProcedure, router } from "@spm/api";
import { describe, expect, it, vi } from "vitest";

const baseContext = {
  health: {
    check: vi.fn(),
  },
  credentials: {
    authenticate: vi.fn(),
  },
  loginRateLimiter: {
    consume: vi.fn(),
    reset: vi.fn(),
  },
  clientIp: "127.0.0.1",
  oidcIdentities: {
    reconcile: vi.fn(),
  },
auditTap: {
  recordCompletedCall: vi.fn().mockResolvedValue(undefined),
},
};

describe("protectedProcedure", () => {
  it("allows an authenticated session", async () => {
    const session = {
      user: {
        id: "user-1",
        email: "alice@example.test",
        name: "Alice Test User",
      },
      authenticatedAt: new Date(),
      sessionId: "11111111-1111-4111-8111-111111111111",
      expiresAt: new Date(Date.now() + 900_000),
      authenticationMethod: "credentials" as const,
    };

    const caller = appRouter.createCaller({
      ...baseContext,
      session,
    });

    await expect(caller.auth.session()).resolves.toEqual({
      user: session.user,
      authenticationMethod: "credentials",
    });
  });

  it("rejects access without an authenticated session", async () => {
    const caller = appRouter.createCaller({
      ...baseContext,
      session: null,
    });

    await expect(caller.auth.session()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  });

  it("runs authentication middleware before the protected resolver", async () => {
    const resolver = vi.fn(() => "protected result");
    const orderRouter = router({
      protectedValue: protectedProcedure.query(resolver),
    });
    const caller = orderRouter.createCaller({
      ...baseContext,
      session: null,
    });

    await expect(caller.protectedValue()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(resolver).not.toHaveBeenCalled();
  });
});
