import {
  createRemoteJWKSet,
  customFetch,
  jwtVerify,
  type FetchImplementation,
  type RemoteJWKSetOptions,
} from "jose";
import { z } from "zod";

const MAX_ID_TOKEN_BYTES = 16 * 1024;

// Allows minor clock skew without materially extending token validity.
const CLOCK_TOLERANCE_SECONDS = 5;

const DEFAULT_JWKS_OPTIONS = {
  timeoutDuration: 3_000,
  cooldownDuration: 30_000,
  cacheMaxAge: 10 * 60 * 1_000,
} as const satisfies RemoteJWKSetOptions;

const emailSchema = z.string().email();

export interface OidcTokenValidationConfiguration {
  issuer: string;
  clientId: string;
  jwksUri: string;
}

export interface OidcTokenValidationDependencies {
  fetch?: FetchImplementation;
  jwksOptions?: Pick<
    RemoteJWKSetOptions,
    "timeoutDuration" | "cooldownDuration" | "cacheMaxAge"
  >;
}

export interface ValidatedOidcToken {
  issuer: string;
  subject: string;
  email: string | null;
  emailVerified: boolean | null;
  expiresAt: Date;
  groups: string[];
}

export class InvalidOidcTokenError extends Error {
  readonly code = "INVALID_OIDC_TOKEN";

  constructor() {
    super("Invalid identity token");
    this.name = "InvalidOidcTokenError";
  }
}

export class OidcTokenValidationService {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly configuration: OidcTokenValidationConfiguration,
    dependencies: OidcTokenValidationDependencies = {},
  ) {
    const options: RemoteJWKSetOptions = {
      ...DEFAULT_JWKS_OPTIONS,
      ...dependencies.jwksOptions,
    };

    if (dependencies.fetch) {
      options[customFetch] = dependencies.fetch;
    }

    this.jwks = createRemoteJWKSet(
      new URL(configuration.jwksUri),
      options,
    );
  }

  async validate(idToken: string): Promise<ValidatedOidcToken> {
    if (
      idToken.trim().length === 0 ||
      Buffer.byteLength(idToken, "utf8") > MAX_ID_TOKEN_BYTES
    ) {
      throw new InvalidOidcTokenError();
    }

    try {
      const { payload } = await jwtVerify(idToken, this.jwks, {
        algorithms: ["RS256"],
        issuer: this.configuration.issuer,
        audience: this.configuration.clientId,
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
      });

      if (
        typeof payload.exp !== "number" ||
        !Number.isFinite(payload.exp)
      ) {
        throw new InvalidOidcTokenError();
      }

      if (typeof payload.sub !== "string") {
        throw new InvalidOidcTokenError();
      }

      const subject = payload.sub.trim();

      if (!subject) {
        throw new InvalidOidcTokenError();
      }

      let email: string | null = null;

      if (payload.email !== undefined) {
        if (typeof payload.email !== "string") {
          throw new InvalidOidcTokenError();
        }

        const candidateEmail = payload.email.trim();

        if (!emailSchema.safeParse(candidateEmail).success) {
          throw new InvalidOidcTokenError();
        }

        email = candidateEmail;
      }

      let emailVerified: boolean | null = null;

      if (payload.email_verified !== undefined) {
        if (typeof payload.email_verified !== "boolean") {
          throw new InvalidOidcTokenError();
        }

        emailVerified = payload.email_verified;
      }

      let groups: string[] = [];
      if (payload.groups !== undefined) {
        if (!Array.isArray(payload.groups) || payload.groups.length > 100) {
          throw new InvalidOidcTokenError();
        }
        groups = [...new Set(payload.groups.map((group) => {
          if (typeof group !== "string") throw new InvalidOidcTokenError();
          const normalized = group.trim();
          if (!normalized || normalized.length > 200) {
            throw new InvalidOidcTokenError();
          }
          return normalized;
        }))];
      }

      return {
        issuer: this.configuration.issuer,
        subject,
        email,
        emailVerified,
        expiresAt: new Date(payload.exp * 1_000),
        groups,
      };
    } catch {
      throw new InvalidOidcTokenError();
    }
  }
}
