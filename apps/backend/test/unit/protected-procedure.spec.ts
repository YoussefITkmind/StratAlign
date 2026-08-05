import { appRouter } from "@spm/api";
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
};

describe("protectedProcedure", () => {
  it("allows an authenticated session", async () => {
    const session = {
      user: {
        id: "user-1",
        email: "alice@example.test",
        name: "Alice Test User",
      },
    };

    const caller = appRouter.createCaller({
      ...baseContext,
      session,
    });

    await expect(caller.auth.session()).resolves.toEqual(session);
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
});
