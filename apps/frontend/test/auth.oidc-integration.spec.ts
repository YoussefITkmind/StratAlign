import type { Account, Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { reconcileOidc } = vi.hoisted(() => {
  process.env.AUTH_OIDC_ISSUER = "https://identity.example.test/";
  process.env.AUTH_OIDC_CLIENT_ID = "test-client";
  process.env.AUTH_OIDC_CLIENT_SECRET = "test-client-secret";

  return {
    reconcileOidc: vi.fn(),
  };
});

vi.mock("../src/services/api-client", () => ({
  trpcClient: {
    auth: {
      reconcileOidc: {
        mutate: reconcileOidc,
      },
    },
  },
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
  authCallbacks,
  GENERIC_OIDC_PROVIDER_ID,
} from "../src/auth";

type SignInCallback = (parameters: {
  user: User;
  account: Account | null;
}) => boolean | Promise<boolean>;

type JwtCallback = (parameters: {
  token: JWT;
  user?: User;
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
    ...overrides,
  };
}

describe("canonical Auth.js OIDC reconciliation", () => {
  beforeEach(() => {
    reconcileOidc.mockReset();
  });

  it("uses the canonical generic-oidc provider ID", () => {
    expect(GENERIC_OIDC_PROVIDER_ID).toBe("generic-oidc");
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
      token: {
        id_token: account.id_token,
        access_token: account.access_token,
        refresh_token: account.refresh_token,
      },
      user,
    });

    expect(jwt).toMatchObject({ sub: platformUser.id });
    expect(jwt).not.toHaveProperty("id_token");
    expect(jwt).not.toHaveProperty("access_token");
    expect(jwt).not.toHaveProperty("refresh_token");

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

    const jwt = await callJwt({ token: {}, user });
    expect(jwt).toMatchObject({ sub: user.id });
    expect(reconcileOidc).not.toHaveBeenCalled();
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
});
