import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../src/database/prisma.service";
import {
  AccountLinkingNotAllowedError,
  IdentityCannotBeProvisionedError,
  InvalidIdentityTokenError,
  OidcIdentityService,
  type OidcTokenValidator,
} from "../../src/modules/auth/oidc-identity.service";
import type { ValidatedOidcToken } from "../../src/modules/auth/oidc-token-validation.service";

const validatedIdentity: ValidatedOidcToken = {
  issuer: "https://identity.example.test/tenant",
  subject: "provider-subject",
  email: " Alice@Example.Test ",
  emailVerified: true,
  expiresAt: new Date("2026-08-05T12:00:00.000Z"),
  groups: [],
};

const platformUser = {
  id: "platform-user-1",
  email: "alice@example.test",
  displayName: "Alice User",
};

function identityWithUser(user = platformUser) {
  return {
    id: "oidc-identity-1",
    issuer: validatedIdentity.issuer,
    subject: validatedIdentity.subject,
    userId: user.id,
    emailAtLink: user.email,
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    groups: [],
    lastValidatedAt: new Date(),
    user,
  };
}

function createHarness(allowVerifiedEmailLinking = false) {
  const validate = vi.fn<OidcTokenValidator["validate"]>();
  validate.mockResolvedValue(validatedIdentity);

  const outerFindIdentity = vi.fn();
  outerFindIdentity.mockResolvedValue(null);

  const transactionFindIdentity = vi.fn();
  transactionFindIdentity.mockResolvedValue(null);

  const findUser = vi.fn();
  findUser.mockResolvedValue(null);

  const createUser = vi.fn();
  createUser.mockResolvedValue(platformUser);

  const createIdentity = vi.fn();
  createIdentity.mockResolvedValue(identityWithUser());
  const updateIdentity = vi.fn().mockResolvedValue(undefined);

  const transactionClient = {
    oidcIdentity: {
      findUnique: transactionFindIdentity,
      create: createIdentity,
    },
    user: {
      findUnique: findUser,
      create: createUser,
    },
  };

  const runTransaction = vi.fn(
    async (
      callback: (
        transaction: typeof transactionClient,
      ) => Promise<unknown>,
    ) => callback(transactionClient),
  );

  const prisma = {
    oidcIdentity: {
      findUnique: outerFindIdentity,
      update: updateIdentity,
    },
    $transaction: runTransaction,
  } as unknown as PrismaService;

  const validator = { validate } satisfies OidcTokenValidator;
  const service = new OidcIdentityService(
    prisma,
    validator,
    allowVerifiedEmailLinking,
  );

  return {
    service,
    validate,
    outerFindIdentity,
    transactionFindIdentity,
    findUser,
    createUser,
    createIdentity,
    updateIdentity,
    runTransaction,
  };
}

describe("OidcIdentityService", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("returns the same platform UUID for an existing identity", async () => {
    const harness = createHarness();
    harness.outerFindIdentity.mockResolvedValue(
      identityWithUser(),
    );

    await expect(
      harness.service.reconcile("opaque-id-token"),
    ).resolves.toEqual(platformUser);

    expect(harness.runTransaction).not.toHaveBeenCalled();
  });

  it("does not relink an existing identity when provider email changes", async () => {
    const harness = createHarness(true);
    harness.validate.mockResolvedValue({
      ...validatedIdentity,
      email: "different@example.test",
    });
    harness.outerFindIdentity.mockResolvedValue(
      identityWithUser(),
    );

    await expect(
      harness.service.reconcile("opaque-id-token"),
    ).resolves.toEqual(platformUser);

    expect(harness.findUser).not.toHaveBeenCalled();
    expect(harness.createIdentity).not.toHaveBeenCalled();
  });

  it("creates a verified first identity and user atomically", async () => {
    const harness = createHarness();

    await expect(
      harness.service.reconcile("opaque-id-token"),
    ).resolves.toEqual(platformUser);

    expect(harness.runTransaction).toHaveBeenCalledOnce();
    expect(harness.createUser).toHaveBeenCalledWith({
      data: {
        email: "alice@example.test",
        emailVerifiedAt: expect.any(Date),
      },
    });
    expect(harness.createIdentity).toHaveBeenCalledWith({
      data: {
        issuer: validatedIdentity.issuer,
        subject: validatedIdentity.subject,
        userId: platformUser.id,
        emailAtLink: "alice@example.test",
        emailVerifiedAt: expect.any(Date),
        groups: [],
        lastValidatedAt: expect.any(Date),
      },
    });

    const userVerifiedAt = harness.createUser.mock.calls[0]?.[0]
      .data.emailVerifiedAt;
    const identityVerifiedAt =
      harness.createIdentity.mock.calls[0]?.[0]
        .data.emailVerifiedAt;

    expect(identityVerifiedAt).toBe(userVerifiedAt);
  });

  it("returns the same UUID on a repeated login", async () => {
    const harness = createHarness();
    harness.outerFindIdentity
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(identityWithUser());

    await harness.service.reconcile("first-token");

    await expect(
      harness.service.reconcile("second-token"),
    ).resolves.toEqual(platformUser);

    expect(harness.runTransaction).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing email", null, true],
    ["empty email", "   ", true],
    ["unverified email", "alice@example.test", false],
    ["unknown verification", "alice@example.test", null],
  ])("rejects a first identity with %s", async (_name, email, verified) => {
    const harness = createHarness();
    harness.validate.mockResolvedValue({
      ...validatedIdentity,
      email,
      emailVerified: verified,
    });

    await expect(
      harness.service.reconcile("opaque-id-token"),
    ).rejects.toEqual(new IdentityCannotBeProvisionedError());

    expect(harness.runTransaction).not.toHaveBeenCalled();
  });

  it("links an existing email only when policy is enabled", async () => {
    const harness = createHarness(true);
    harness.findUser.mockResolvedValue(platformUser);

    await expect(
      harness.service.reconcile("opaque-id-token"),
    ).resolves.toEqual(platformUser);

    expect(harness.createUser).not.toHaveBeenCalled();
    expect(harness.createIdentity).toHaveBeenCalledWith({
      data: {
        issuer: validatedIdentity.issuer,
        subject: validatedIdentity.subject,
        userId: platformUser.id,
        emailAtLink: "alice@example.test",
        emailVerifiedAt: expect.any(Date),
        groups: [],
        lastValidatedAt: expect.any(Date),
      },
    });
  });

  it("rejects existing-email linking when policy is disabled", async () => {
    const harness = createHarness(false);
    harness.findUser.mockResolvedValue(platformUser);

    await expect(
      harness.service.reconcile("opaque-id-token"),
    ).rejects.toEqual(new AccountLinkingNotAllowedError());

    expect(harness.createUser).not.toHaveBeenCalled();
    expect(harness.createIdentity).not.toHaveBeenCalled();
  });

  it("does not disclose the existing account type in linking errors", async () => {
    const harness = createHarness(false);
    harness.findUser.mockResolvedValue(platformUser);

    let caught: unknown;

    try {
      await harness.service.reconcile("opaque-id-token");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AccountLinkingNotAllowedError);
    expect((caught as Error).message).toBe(
      "Account linking not allowed",
    );
    expect((caught as Error).message).not.toMatch(
      /credential|password|provider/i,
    );
  });

  it("converges on the winner after a same-identity P2002 race", async () => {
    const harness = createHarness();
    harness.runTransaction.mockRejectedValueOnce({ code: "P2002" });
    harness.outerFindIdentity
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(identityWithUser());

    await expect(
      harness.service.reconcile("opaque-id-token"),
    ).resolves.toEqual(platformUser);

    expect(harness.runTransaction).toHaveBeenCalledOnce();
  });

  it("does not attach an email-race identity to the wrong user", async () => {
    const harness = createHarness(false);
    const emailRaceWinner = {
      id: "email-race-winner",
      email: "alice@example.test",
      displayName: null,
    };

    harness.runTransaction.mockRejectedValueOnce({ code: "P2002" });
    harness.outerFindIdentity.mockResolvedValue(null);
    harness.findUser.mockResolvedValue(emailRaceWinner);

    await expect(
      harness.service.reconcile("opaque-id-token"),
    ).rejects.toEqual(new AccountLinkingNotAllowedError());

    expect(harness.findUser).toHaveBeenCalledWith({
      where: { email: "alice@example.test" },
    });
    expect(harness.createIdentity).not.toHaveBeenCalled();
    expect(harness.runTransaction).toHaveBeenCalledTimes(2);
  });

  it("uses a bounded retry strategy for unresolved P2002 races", async () => {
    const harness = createHarness();
    harness.runTransaction.mockRejectedValue({ code: "P2002" });
    harness.outerFindIdentity.mockResolvedValue(null);

    await expect(
      harness.service.reconcile("opaque-id-token"),
    ).rejects.toEqual(new IdentityCannotBeProvisionedError());

    expect(harness.runTransaction).toHaveBeenCalledTimes(2);
  });

  it("converts transaction failures into a generic domain error", async () => {
    const harness = createHarness();
    harness.runTransaction.mockRejectedValue(
      new Error("database host and query details"),
    );

    await expect(
      harness.service.reconcile("opaque-id-token"),
    ).rejects.toEqual(new IdentityCannotBeProvisionedError());
  });

  it("never exposes token or identity information in errors", async () => {
    const token = "sensitive-opaque-id-token";
    const harness = createHarness();
    harness.validate.mockRejectedValue(
      new Error(`${token}:${validatedIdentity.subject}`),
    );

    let invalidTokenError: unknown;

    try {
      await harness.service.reconcile(token);
    } catch (error) {
      invalidTokenError = error;
    }

    expect(invalidTokenError).toBeInstanceOf(
      InvalidIdentityTokenError,
    );
    expect((invalidTokenError as Error).message).toBe(
      "Invalid identity token",
    );
    expect((invalidTokenError as Error).message).not.toContain(token);
    expect((invalidTokenError as Error).message).not.toContain(
      validatedIdentity.subject,
    );

    const provisionHarness = createHarness();
    provisionHarness.runTransaction.mockRejectedValue(
      new Error(
        `${validatedIdentity.email}:${validatedIdentity.subject}`,
      ),
    );

    let provisionError: unknown;

    try {
      await provisionHarness.service.reconcile(token);
    } catch (error) {
      provisionError = error;
    }

    expect(provisionError).toBeInstanceOf(
      IdentityCannotBeProvisionedError,
    );
    expect((provisionError as Error).message).toBe(
      "Identity cannot be provisioned",
    );
    expect((provisionError as Error).message).not.toContain(
      validatedIdentity.email ?? "",
    );
    expect((provisionError as Error).message).not.toContain(
      validatedIdentity.subject,
    );
  });
});
