import type { Account, Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { reconcileOidc, login, stepUpCookie } = vi.hoisted(() => {
  process.env.AUTH_OIDC_ISSUER = "https://identity.example.test/";
  process.env.AUTH_OIDC_CLIENT_ID = "test-client";
  process.env.AUTH_OIDC_CLIENT_SECRET = "test-client-secret";
  process.env.AUTH_SECRET = "test-auth-secret-at-least-32-characters-long";

  return {
    reconcileOidc: vi.fn(),
    login: vi.fn(),
    stepUpCookie: { value: null as string | null },
  };
});

vi.mock("../src/services/api-client", () => ({
  trpcClient: {
    auth: {
      reconcileOidc: {
        mutate: reconcileOidc,
      },
      login: {
        mutate: login,
      },
    },
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => stepUpCookie.value ? { value: stepUpCookie.value } : undefined,
    delete: vi.fn(() => { stepUpCookie.value = null; }),
  })),
}));

vi.mock("next-auth", () => ({
  default: vi.fn(() => ({
    handlers: {},
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn((configuration) => ({
    id: "credentials",
    type: "credentials",
    ...configuration,
  })),
}));

import {
  authConfig,
  authCallbacks,
  buildProviderLogoutUrl,
  GENERIC_OIDC_PROVIDER_ID,
  OIDC_REFRESH_ERROR,
  oidcLogoutUrl,
  refreshOidcToken,
  safePostLogoutUrl,
} from "../src/auth";
import { createOidcStepUpState } from "../src/lib/auth/oidc-step-up-state";

type SignInCallback = (parameters: {
  user: User;
  account: Account | null;
}) => boolean | Promise<boolean>;

type JwtCallback = (parameters: {
  token: JWT;
  user?: User;
  account?: Account | null;
}) => JWT | Promise<JWT | null> | null;

type SessionCallback = (parameters: {
  session: Session;
  token: JWT;
}) => Session | Promise<Session>;

const callSignIn = authCallbacks.signIn as SignInCallback;
const callJwt = authCallbacks.jwt as JwtCallback;
const callSession = authCallbacks.session as unknown as SessionCallback;

function oidcAccount(overrides: Partial<Account> = {}): Account {
  return {
    provider: GENERIC_OIDC_PROVIDER_ID,
    type: "oidc",
    providerAccountId: "provider-subject",
    id_token: "signed-id-token",
    access_token: "provider-access-token",
    refresh_token: "provider-refresh-token",
    expires_at: 2_000_000_000,
    ...overrides,
  };
}

describe("canonical Auth.js OIDC reconciliation", () => {
  beforeEach(() => {
    reconcileOidc.mockReset();
    login.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    stepUpCookie.value = null;
  });

  it("uses the canonical generic-oidc provider ID", () => {
    expect(GENERIC_OIDC_PROVIDER_ID).toBe("generic-oidc");
    expect(authConfig.session).toEqual({ strategy: "jwt", maxAge: 900 });
    const provider = authConfig.providers.find(
      (candidate) => typeof candidate !== "function" && candidate.id === GENERIC_OIDC_PROVIDER_ID,
    );
    expect(provider).toMatchObject({
      checks: ["pkce", "state"],
      authorization: { params: { scope: "openid profile email" } },
    });
  });

  it("reconciles the ID token and propagates only safe platform identity data", async () => {
    const platformUser = {
      id: "4d2b619c-246a-4dde-a479-31179ed049ad",
      email: "platform-user@example.test",
      displayName: "Platform User",
    };
    reconcileOidc.mockResolvedValue(platformUser);
    const user: User = {
      id: "provider-subject",
      email: "provider-email@example.test",
      name: "Provider Name",
      image: "https://identity.example.test/provider-picture.png",
    };
    const account = oidcAccount();

    await expect(callSignIn({ user, account })).resolves.toBe(true);
    expect(reconcileOidc).toHaveBeenCalledOnce();
    expect(reconcileOidc).toHaveBeenCalledWith({
      idToken: "signed-id-token",
    });
    expect(user).toMatchObject({
      id: platformUser.id,
      email: platformUser.email,
      name: platformUser.displayName,
      image: null,
    });

    const jwt = await callJwt({
      token: {},
      user,
      account,
    });

    expect(jwt).toMatchObject({ sub: platformUser.id });
    expect(jwt).toHaveProperty("authenticationTime", expect.any(Number));
    expect(jwt).toHaveProperty("sessionId", expect.stringMatching(/^[0-9a-f-]{36}$/i));
    expect(jwt).not.toHaveProperty("id_token");
    expect(jwt).not.toHaveProperty("access_token");
    expect(jwt).not.toHaveProperty("refresh_token");
    expect(jwt).toMatchObject({
      oidcAccessToken: account.access_token,
      oidcRefreshToken: account.refresh_token,
      oidcAccessTokenExpiresAt: account.expires_at! * 1_000,
    });

    const session = await callSession({
      session: {
        expires: new Date(Date.now() + 60_000).toISOString(),
        user: {
          id: "provider-subject",
          role: "member",
          email: platformUser.email,
          name: platformUser.displayName,
        },
      },
      token: jwt as JWT,
    });

    expect(session.user.id).toBe(platformUser.id);
    expect(session).not.toHaveProperty("id_token");
    expect(session).not.toHaveProperty("access_token");
    expect(session).not.toHaveProperty("refresh_token");
    expect(session).not.toHaveProperty("authenticationTime");
    expect(session).not.toHaveProperty("sessionId");
  });

  it("authenticates credentials through the backend and uses the platform user ID", async () => {
    const provider = authConfig.providers.find(
      (candidate) =>
        typeof candidate !== "function" && candidate.id === "credentials",
    );

    expect(provider).toBeDefined();

    const authorize = (
      provider as {
        authorize?: (
          credentials: Record<string, unknown>,
        ) => unknown | Promise<unknown>;
      }
    ).authorize;

    expect(authorize).toBeTypeOf("function");

    const platformUser = {
      id: "4d2b619c-246a-4dde-a479-31179ed049ad",
      email: "credential-user@example.test",
      displayName: "Credential User",
    };

    login.mockResolvedValue(platformUser);

    await expect(
      authorize!({
        email: "credential-user@example.test",
        password: "correct-password",
      }),
    ).resolves.toEqual({
      id: platformUser.id,
      email: platformUser.email,
      name: platformUser.displayName,
    });

    expect(login).toHaveBeenCalledOnce();
    expect(login).toHaveBeenCalledWith({
      email: "credential-user@example.test",
      password: "correct-password",
    });
  });

  it("rejects credentials when backend authentication fails", async () => {
    const provider = authConfig.providers.find(
      (candidate) =>
        typeof candidate !== "function" && candidate.id === "credentials",
    );

    const authorize = (
      provider as {
        authorize?: (
          credentials: Record<string, unknown>,
        ) => unknown | Promise<unknown>;
      }
    ).authorize;

    // Shaped like a real TRPCClientError from a reachable backend that
    // rejected the credentials (mirrors auth.login's UNAUTHORIZED response).
    login.mockRejectedValue({
      data: { code: "UNAUTHORIZED", httpStatus: 401 },
      message: "Invalid email or password",
    });

    await expect(
      authorize!({
        email: "credential-user@example.test",
        password: "wrong-password",
      }),
    ).resolves.toBeNull();

    expect(login).toHaveBeenCalledWith({
      email: "credential-user@example.test",
      password: "wrong-password",
    });
  });

  it("falls back to a demo session when the backend cannot be reached at all", async () => {
    const provider = authConfig.providers.find(
      (candidate) =>
        typeof candidate !== "function" && candidate.id === "credentials",
    );

    const authorize = (
      provider as {
        authorize?: (
          credentials: Record<string, unknown>,
        ) => unknown | Promise<unknown>;
      }
    ).authorize;

    // A raw network failure has no `data` — no response ever came back —
    // unlike a real backend's TRPCClientError rejection.
    login.mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      authorize!({
        email: "demo-user@example.test",
        password: "anything",
      }),
    ).resolves.toEqual({
      id: "demo-user@example.test",
      email: "demo-user@example.test",
      name: "demo-user@example.test",
    });
  });

  it("rejects credentials with an empty email or password", async () => {
    const provider = authConfig.providers.find(
      (candidate) =>
        typeof candidate !== "function" && candidate.id === "credentials",
    );

    const authorize = (
      provider as {
        authorize?: (
          credentials: Record<string, unknown>,
        ) => unknown | Promise<unknown>;
      }
    ).authorize;

    await expect(
      authorize!({ email: "", password: "wrong-password" }),
    ).resolves.toBeNull();

    await expect(
      authorize!({ email: "credential-user@example.test", password: "" }),
    ).resolves.toBeNull();
  });

  it("leaves the credentials flow unchanged", async () => {
    const user: User = {
      id: "credential-platform-user",
      email: "credential-user@example.test",
      name: "Credential User",
    };

    await expect(
      callSignIn({
        user,
        account: {
          provider: "credentials",
          type: "credentials",
          providerAccountId: user.id!,
        },
      }),
    ).resolves.toBe(true);

    const jwt = await callJwt({
      token: {
        oidcAccessToken: "stale-access-token",
        oidcRefreshToken: "stale-refresh-token",
        oidcAccessTokenExpiresAt: 0,
      },
      user,
      account: {
        provider: "credentials",
        type: "credentials",
        providerAccountId: user.id!,
      },
    });
    expect(jwt).toMatchObject({ sub: user.id });
    expect(jwt).toHaveProperty("authenticationTime", expect.any(Number));
    expect(jwt).toHaveProperty("sessionId", expect.stringMatching(/^[0-9a-f-]{36}$/i));
    expect(jwt).not.toHaveProperty("oidcAccessToken");
    expect(jwt).not.toHaveProperty("oidcRefreshToken");
    expect(reconcileOidc).not.toHaveBeenCalled();
  });

  it("preserves a stable private session ID on reads and rotates it for every new login", async () => {
    const first = await callJwt({
      token: {},
      user: { id: "platform-user" },
      account: { provider: "credentials", type: "credentials", providerAccountId: "platform-user" },
    }) as JWT;
    const read = await callJwt({ token: first }) as JWT;
    const second = await callJwt({
      token: {},
      user: { id: "platform-user" },
      account: { provider: "credentials", type: "credentials", providerAccountId: "platform-user" },
    }) as JWT;

    expect(read.sessionId).toBe(first.sessionId);
    expect(read.authenticationTime).toBe(first.authenticationTime);
    expect(second.sessionId).not.toBe(first.sessionId);
  });

  it("rejects OIDC sign-in safely when the ID token is missing or empty", async () => {
    for (const idToken of [undefined, "   "]) {
      const user: User = { id: "provider-subject" };
      const account = {
        ...oidcAccount(),
        id_token: idToken,
      } as unknown as Account;

      await expect(
        callSignIn({
          user,
          account,
        }),
      ).resolves.toBe(false);

      expect(user.id).toBe("provider-subject");
    }

    expect(reconcileOidc).not.toHaveBeenCalled();
  });

  it("rejects reconciliation failures without exposing their details", async () => {
    reconcileOidc.mockRejectedValue(
      new Error("sensitive identity and account details"),
    );
    const user: User = { id: "provider-subject" };

    await expect(
      callSignIn({ user, account: oidcAccount() }),
    ).resolves.toBe(false);

    expect(user.id).toBe("provider-subject");
  });

  it("rejects OIDC step-up when the provider authenticates a different platform user", async () => {
    const expectedUserId = "4d2b619c-246a-4dde-a479-31179ed049ad";
    stepUpCookie.value = createOidcStepUpState(
      expectedUserId,
      process.env.AUTH_SECRET ?? "test-auth-secret-at-least-32-characters-long",
    );
    reconcileOidc.mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "different@example.test",
      displayName: null,
    });
    await expect(callSignIn({
      user: { id: "provider-subject" }, account: oidcAccount(),
    })).resolves.toBe(false);
  });

  it("does not reconcile again during ordinary JWT and session reads", async () => {
    const platformUserId = "4d2b619c-246a-4dde-a479-31179ed049ad";
    const jwt = await callJwt({ token: { sub: platformUserId } });
    const session = await callSession({
      session: {
        expires: new Date(Date.now() + 60_000).toISOString(),
        user: {
          id: "stale-id",
          role: "member",
        },
      },
      token: jwt as JWT,
    });

    expect(jwt).toMatchObject({ sub: platformUserId });
    expect(session.user.id).toBe(platformUserId);
    expect(reconcileOidc).not.toHaveBeenCalled();
  });

  it("does not refresh an OIDC access token before expiry", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const jwt = await callJwt({
      token: {
        sub: "platform-user",
        oidcAccessToken: "current-access-token",
        oidcRefreshToken: "current-refresh-token",
        oidcAccessTokenExpiresAt: Date.now() + 60_000,
      },
    });

    expect(jwt).toMatchObject({ oidcAccessToken: "current-access-token" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["rotates", "rotated-refresh-token", "rotated-refresh-token"],
    ["retains", undefined, "current-refresh-token"],
  ])("%s the refresh token according to the provider response", async (_case, replacement, expected) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        token_endpoint: "https://identity.example.test/token",
        end_session_endpoint: "https://identity.example.test/logout",
      }),
    }));
    const tokenFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: "new-access-token",
        expires_in: 300,
        refresh_token: replacement,
      }),
    });

    const refreshed = await refreshOidcToken({
      sub: "platform-user",
      oidcAccessToken: "expired-access-token",
      oidcRefreshToken: "current-refresh-token",
      oidcAccessTokenExpiresAt: Date.now() - 1,
    }, tokenFetch as typeof fetch);

    expect(refreshed).toMatchObject({
      oidcAccessToken: "new-access-token",
      oidcRefreshToken: expected,
    });
    expect(refreshed).not.toHaveProperty("oidcRefreshError");
  });

  it("fails refresh safely and removes the browser session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sensitive provider failure")));
    const failed = await refreshOidcToken({
      sub: "platform-user",
      oidcAccessToken: "expired-access-token",
      oidcRefreshToken: "current-refresh-token",
      oidcAccessTokenExpiresAt: Date.now() - 1,
    });

    expect(failed).toMatchObject({ oidcRefreshError: OIDC_REFRESH_ERROR });
    expect(failed).not.toHaveProperty("oidcAccessToken");

    const session = await callSession({
      session: {
        expires: new Date(Date.now() + 60_000).toISOString(),
        user: { id: "platform-user", role: "member" },
      },
      token: failed,
    });
    expect(session).toBeNull();
    expect(JSON.stringify(session)).not.toContain("sensitive provider failure");
  });

  it("builds safe provider logout URLs and rejects open redirects", async () => {
    expect(safePostLogoutUrl("https://attacker.example.test/callback"))
      .toBe("http://localhost:3000/login");
    expect(safePostLogoutUrl("/dashboard"))
      .toBe("http://localhost:3000/dashboard");

    const logout = await oidcLogoutUrl("/login");
    expect(logout).toBe(
      "https://identity.example.test/logout?post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Flogin",
    );
    expect(buildProviderLogoutUrl(undefined, "/login")).toBeNull();
  });
});
