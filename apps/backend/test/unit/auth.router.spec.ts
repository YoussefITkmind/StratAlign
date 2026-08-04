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

  const caller = appRouter.createCaller({
    health: {
      check: vi.fn(),
    },
    credentials: {
      authenticate,
    },
  });

  beforeEach(() => {
    authenticate.mockReset();
  });

  it("returns safe user data for valid credentials", async () => {
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
  });

  it("rejects malformed input before authentication", async () => {
    await expect(
      caller.auth.login({
        email: "not-an-email",
        password: "",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    expect(authenticate).not.toHaveBeenCalled();
  });
});