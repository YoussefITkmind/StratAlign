import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  type FetchImplementation,
  type JWK,
  type KeyLike,
} from "jose";
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  InvalidOidcTokenError,
  OidcTokenValidationService,
} from "../../src/modules/auth/oidc-token-validation.service";

const issuer = "https://identity.example.test/tenant";
const clientId = "spm-web";
const jwksUri = "https://identity.example.test/jwks";

interface SigningKey {
  privateKey: KeyLike;
  publicJwk: JWK;
  kid: string;
}

async function createSigningKey(kid: string): Promise<SigningKey> {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);

  return {
    privateKey,
    publicJwk: {
      ...publicJwk,
      alg: "RS256",
      kid,
      use: "sig",
    },
    kid,
  };
}

function createJwksFetch(
  getKeys: () => JWK[],
): ReturnType<typeof vi.fn<FetchImplementation>> {
  return vi.fn<FetchImplementation>(async () => {
    return new Response(
      JSON.stringify({ keys: getKeys() }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  });
}

async function signToken(
  key: SigningKey,
  claims: Record<string, unknown> = {},
  options: {
    issuer?: string;
    audience?: string | string[];
    expiration?: number | null;
    notBefore?: number;
  } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1_000);
  let token = new SignJWT({
    sub: "user-subject",
    email: "alice@example.test",
    email_verified: true,
    ...claims,
  })
    .setProtectedHeader({
      alg: "RS256",
      kid: key.kid,
    })
    .setIssuedAt()
    .setIssuer(options.issuer ?? issuer)
    .setAudience(options.audience ?? clientId);

  if (options.expiration !== null) {
    token = token.setExpirationTime(
      options.expiration ?? now + 300,
    );
  }

  if (options.notBefore !== undefined) {
    token = token.setNotBefore(options.notBefore);
  }

  return token.sign(key.privateKey);
}

function createService(
  fetchImplementation: FetchImplementation,
): OidcTokenValidationService {
  return new OidcTokenValidationService(
    {
      issuer,
      clientId,
      jwksUri,
    },
    {
      fetch: fetchImplementation,
      jwksOptions: {
        timeoutDuration: 100,
        cooldownDuration: 0,
        cacheMaxAge: 60_000,
      },
    },
  );
}

describe("OidcTokenValidationService", () => {
  let primaryKey: SigningKey;
  let secondaryKey: SigningKey;
  let currentKeys: JWK[];
  let fetchImplementation: ReturnType<typeof vi.fn<FetchImplementation>>;
  let service: OidcTokenValidationService;

  beforeAll(async () => {
    [primaryKey, secondaryKey] = await Promise.all([
      createSigningKey("primary-key"),
      createSigningKey("secondary-key"),
    ]);
  });

  beforeEach(() => {
    currentKeys = [primaryKey.publicJwk];
    fetchImplementation = createJwksFetch(() => currentKeys);
    service = createService(fetchImplementation);
  });

  it("validates a signed token and returns only trusted identity fields", async () => {
    const expiration = Math.floor(Date.now() / 1_000) + 300;
    const token = await signToken(primaryKey, {}, { expiration });

    await expect(service.validate(token)).resolves.toEqual({
      issuer,
      subject: "user-subject",
      email: "alice@example.test",
      emailVerified: true,
      expiresAt: new Date(expiration * 1_000),
    });
  });

  it("accepts absent optional email claims", async () => {
    const token = await signToken(primaryKey, {
      email: undefined,
      email_verified: undefined,
    });

    await expect(service.validate(token)).resolves.toMatchObject({
      email: null,
      emailVerified: null,
    });
  });

  it("preserves an explicit false email verification claim", async () => {
    const token = await signToken(primaryKey, {
      email_verified: false,
    });

    await expect(service.validate(token)).resolves.toMatchObject({
      emailVerified: false,
    });
  });

  it.each([
    ["wrong issuer", { issuer: "https://other.example.test" }],
    ["wrong audience", { audience: "another-client" }],
  ])("rejects a token with the %s", async (_name, options) => {
    const token = await signToken(primaryKey, {}, options);

    await expect(service.validate(token)).rejects.toEqual(
      new InvalidOidcTokenError(),
    );
  });

  it("accepts an audience array containing the configured client ID", async () => {
    const token = await signToken(
      primaryKey,
      {},
      { audience: ["another-client", clientId] },
    );

    await expect(service.validate(token)).resolves.toMatchObject({
      subject: "user-subject",
    });
  });

  it("rejects expired tokens and tokens that are not active yet", async () => {
    const now = Math.floor(Date.now() / 1_000);
    const expired = await signToken(
      primaryKey,
      {},
      { expiration: now - 60 },
    );
    const notActive = await signToken(
      primaryKey,
      {},
      { notBefore: now + 60 },
    );

    await expect(service.validate(expired)).rejects.toEqual(
      new InvalidOidcTokenError(),
    );
    await expect(service.validate(notActive)).rejects.toEqual(
      new InvalidOidcTokenError(),
    );
  });

  it("rejects tokens without an expiration", async () => {
    const token = await signToken(
      primaryKey,
      {},
      { expiration: null },
    );

    await expect(service.validate(token)).rejects.toEqual(
      new InvalidOidcTokenError(),
    );
  });

  it.each([
    ["missing", { sub: undefined }],
    ["non-string", { sub: 123 }],
    ["blank", { sub: "   " }],
  ])("rejects a %s subject", async (_name, claims) => {
    const token = await signToken(primaryKey, claims);

    await expect(service.validate(token)).rejects.toEqual(
      new InvalidOidcTokenError(),
    );
  });

  it("rejects malformed optional claims", async () => {
    const malformedEmail = await signToken(primaryKey, {
      email: "not-an-email",
    });
    const coercedVerification = await signToken(primaryKey, {
      email_verified: "true",
    });

    await expect(service.validate(malformedEmail)).rejects.toEqual(
      new InvalidOidcTokenError(),
    );
    await expect(service.validate(coercedVerification)).rejects.toEqual(
      new InvalidOidcTokenError(),
    );
  });

  it("rejects tokens signed by the wrong key and tampered tokens", async () => {
    const wrongKeyToken = await signToken(secondaryKey);
    const validToken = await signToken(primaryKey);
    const segments = validToken.split(".");
    const tamperedToken = [
      segments[0],
      segments[1],
      `${segments[2]?.slice(0, -1)}${segments[2]?.endsWith("A") ? "B" : "A"}`,
    ].join(".");

    await expect(service.validate(wrongKeyToken)).rejects.toEqual(
      new InvalidOidcTokenError(),
    );
    await expect(service.validate(tamperedToken)).rejects.toEqual(
      new InvalidOidcTokenError(),
    );
  });

  it("rejects malformed, none, and HS256 tokens", async () => {
    const encodedHeader = Buffer.from(
      JSON.stringify({ alg: "none" }),
    ).toString("base64url");
    const encodedPayload = Buffer.from(
      JSON.stringify({ sub: "user-subject" }),
    ).toString("base64url");
    const noneToken = `${encodedHeader}.${encodedPayload}.`;
    const hsToken = await new SignJWT({ sub: "user-subject" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(issuer)
      .setAudience(clientId)
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("symmetric-test-key"));

    for (const token of ["malformed-token", noneToken, hsToken]) {
      await expect(service.validate(token)).rejects.toEqual(
        new InvalidOidcTokenError(),
      );
    }
  });

  it("rejects empty and oversized tokens before JWKS access", async () => {
    for (const token of ["", "   ", "x".repeat(16 * 1024 + 1)]) {
      await expect(service.validate(token)).rejects.toEqual(
        new InvalidOidcTokenError(),
      );
    }

    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("caches the JWKS between validations", async () => {
    await service.validate(await signToken(primaryKey));
    await service.validate(await signToken(primaryKey));

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("refreshes the JWKS when the provider rotates to a new key", async () => {
    await service.validate(await signToken(primaryKey));

    currentKeys = [secondaryKey.publicJwk];

    await expect(
      service.validate(await signToken(secondaryKey)),
    ).resolves.toMatchObject({
      subject: "user-subject",
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("turns network failures into the same generic safe error", async () => {
    const networkFailure = vi.fn<FetchImplementation>(async () => {
      throw new Error("provider response and network details");
    });
    const failingService = createService(networkFailure);
    const token = await signToken(primaryKey, {
      sub: "sensitive-subject",
      email: "sensitive@example.test",
    });

    let caught: unknown;

    try {
      await failingService.validate(token);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InvalidOidcTokenError);
    expect((caught as Error).message).toBe("Invalid identity token");
    expect((caught as Error).message).not.toContain(token);
    expect((caught as Error).message).not.toContain("sensitive-subject");
    expect((caught as Error).message).not.toContain(
      "sensitive@example.test",
    );
    expect((caught as Error).message).not.toContain("provider response");
  });
});
