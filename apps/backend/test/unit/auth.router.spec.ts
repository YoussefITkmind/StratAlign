import { appRouter } from "@spm/api";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

describe("auth router", () => {
  const authenticate = vi.fn();
  const consume = vi.fn();
  const reset = vi.fn();
  const reconcile = vi.fn();
  const recordFreshness = vi.fn();

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
    session: null,
    oidcIdentities: {
      reconcile,
    },
    authenticationFreshness: { record: recordFreshness },
    authorization: { resolve: vi.fn() },
    iam: {
      listRoles: vi.fn(), listGroupMappings: vi.fn(), upsertGroupMapping: vi.fn(),
      grantScope: vi.fn(), listCredentialUsers: vi.fn(), listScopeGrants: vi.fn(),
      getStepUpPolicy: vi.fn(),
    },
  });

  beforeEach(() => {
    authenticate.mockReset();
    consume.mockReset();
    reset.mockReset();
    reconcile.mockReset();
    recordFreshness.mockReset();
    recordFreshness.mockResolvedValue(undefined);

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
    expect(recordFreshness).not.toHaveBeenCalled();
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

  it("reconciles an OIDC token to safe platform user data", async () => {
    const user = {
      id: "4d2b619c-246a-4dde-a479-31179ed049ad",
      email: "alice@example.test",
      displayName: "Alice Test User",
    };
    reconcile.mockResolvedValue(user);

    await expect(
      caller.auth.reconcileOidc({ idToken: "signed-id-token" }),
    ).resolves.toEqual(user);

    expect(reconcile).toHaveBeenCalledWith("signed-id-token");
    expect(recordFreshness).not.toHaveBeenCalled();
  });

  it("accepts only an ID token for OIDC reconciliation", async () => {
    await expect(
      caller.auth.reconcileOidc({
        idToken: "signed-id-token",
        issuer: "https://attacker.example.test",
      } as { idToken: string }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(reconcile).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", {}],
    ["empty", { idToken: "   " }],
    ["oversized", { idToken: "x".repeat(16 * 1024 + 1) }],
  ])("rejects %s OIDC token input", async (_case, input) => {
    await expect(
      caller.auth.reconcileOidc(input as { idToken: string }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(reconcile).not.toHaveBeenCalled();
  });

  it.each([
    "INVALID_IDENTITY_TOKEN",
    "IDENTITY_CANNOT_BE_PROVISIONED",
    "ACCOUNT_LINKING_NOT_ALLOWED",
  ])("maps %s to the same safe authorization error", async (code) => {
    const sensitiveValue = "sensitive-token-and-identity";
    reconcile.mockRejectedValue({ code, message: sensitiveValue });

    let caught: unknown;
    try {
      await caller.auth.reconcileOidc({ idToken: "signed-id-token" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unable to sign in",
    });
    expect(JSON.stringify(caught)).not.toContain(sensitiveValue);
  });

  it("maps unexpected reconciliation failures to a safe internal error", async () => {
    const sensitiveValue = "database-and-identity-details";
    reconcile.mockRejectedValue(new Error(sensitiveValue));

    let caught: unknown;
    try {
      await caller.auth.reconcileOidc({ idToken: "signed-id-token" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Unable to sign in",
    });
    expect(JSON.stringify(caught)).not.toContain(sensitiveValue);
  });
});
