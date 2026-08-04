import { appRouter } from "@spm/api";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

describe("auth.login", () => {
  const authenticate = vi.fn();
  const consume = vi.fn();
  const reset = vi.fn();

  const caller = appRouter.createCaller({
    health: {
      check: vi.fn(),
    },
    credentials: {
      authenticate,
    },
    loginRateLimiter: {
      consume,
      reset,
    },
    clientIp: "127.0.0.1",
  });

  beforeEach(() => {
    authenticate.mockReset();
    consume.mockReset();
    reset.mockReset();

    consume.mockResolvedValue({
      allowed: true,
      remainingAttempts: 4,
      retryAfterSeconds: 900,
    });

    reset.mockResolvedValue(undefined);
  });

  it("returns safe user data and resets the limit", async () => {
    const user = {
      id: "user-1",
      email: "alice@example.test",
      displayName: "Alice Test User",
    };

    authenticate.mockResolvedValue(user);

    await expect(
      caller.auth.login({
        email: "alice@example.test",
        password: "LocalTestPassword123!",
      }),
    ).resolves.toEqual(user);

    expect(consume).toHaveBeenCalledWith(
      "127.0.0.1",
      "alice@example.test",
    );

    expect(reset).toHaveBeenCalledWith(
      "127.0.0.1",
      "alice@example.test",
    );
  });

  it("returns UNAUTHORIZED for a wrong password", async () => {
    authenticate.mockResolvedValue(null);

    await expect(
      caller.auth.login({
        email: "alice@example.test",
        password: "WrongPassword123!",
      }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Invalid email or password",
    });

    expect(reset).not.toHaveBeenCalled();
  });

  it("returns the same error for an unknown email", async () => {
    authenticate.mockResolvedValue(null);

    await expect(
      caller.auth.login({
        email: "unknown@example.test",
        password: "WrongPassword123!",
      }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Invalid email or password",
    });

    expect(reset).not.toHaveBeenCalled();
  });

  it("blocks login when the rate limit is exceeded", async () => {
    consume.mockResolvedValue({
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds: 600,
    });

    await expect(
      caller.auth.login({
        email: "alice@example.test",
        password: "LocalTestPassword123!",
      }),
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message:
        "Too many login attempts. Please try again later.",
    });

    expect(authenticate).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it("rejects malformed input before rate limiting", async () => {
    await expect(
      caller.auth.login({
        email: "not-an-email",
        password: "",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    expect(consume).not.toHaveBeenCalled();
    expect(authenticate).not.toHaveBeenCalled();
  });
});