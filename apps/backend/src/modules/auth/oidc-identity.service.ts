import type { PrismaService } from "../../database/prisma.service";
import type { ValidatedOidcToken } from "./oidc-token-validation.service";

const MAX_RECONCILIATION_ATTEMPTS = 2;

export interface OidcTokenValidator {
  validate(idToken: string): Promise<ValidatedOidcToken>;
}

export interface ReconciledOidcUser {
  id: string;
  email: string;
  displayName: string | null;
}

export class InvalidIdentityTokenError extends Error {
  readonly code = "INVALID_IDENTITY_TOKEN";

  constructor() {
    super("Invalid identity token");
    this.name = "InvalidIdentityTokenError";
  }
}

export class IdentityCannotBeProvisionedError extends Error {
  readonly code = "IDENTITY_CANNOT_BE_PROVISIONED";

  constructor() {
    super("Identity cannot be provisioned");
    this.name = "IdentityCannotBeProvisionedError";
  }
}

export class AccountLinkingNotAllowedError extends Error {
  readonly code = "ACCOUNT_LINKING_NOT_ALLOWED";

  constructor() {
    super("Account linking not allowed");
    this.name = "AccountLinkingNotAllowedError";
  }
}

type ReconciliationDomainError =
  | InvalidIdentityTokenError
  | IdentityCannotBeProvisionedError
  | AccountLinkingNotAllowedError;

export class OidcIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenValidator: OidcTokenValidator,
    private readonly allowVerifiedEmailLinking: boolean,
  ) {}

  async reconcile(idToken: string): Promise<ReconciledOidcUser> {
    let identity: ValidatedOidcToken;

    try {
      identity = await this.tokenValidator.validate(idToken);
    } catch {
      throw new InvalidIdentityTokenError();
    }

    try {
      const existingUser = await this.findUserByIdentity(
        identity.issuer,
        identity.subject,
      );

      if (existingUser) {
        return this.toSafeUser(existingUser);
      }

      const email = this.requireVerifiedEmail(identity);

      return await this.reconcileFirstSeenIdentity(identity, email);
    } catch (error) {
      if (this.isDomainError(error)) {
        throw error;
      }

      throw new IdentityCannotBeProvisionedError();
    }
  }

  private async reconcileFirstSeenIdentity(
    identity: ValidatedOidcToken,
    email: string,
  ): Promise<ReconciledOidcUser> {
    for (
      let attempt = 0;
      attempt < MAX_RECONCILIATION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          const existingIdentity =
            await transaction.oidcIdentity.findUnique({
              where: {
                issuer_subject: {
                  issuer: identity.issuer,
                  subject: identity.subject,
                },
              },
              include: {
                user: true,
              },
            });

          if (existingIdentity) {
            return this.toSafeUser(existingIdentity.user);
          }

          const existingUser = await transaction.user.findUnique({
            where: { email },
          });

          const verifiedAt = new Date();

          if (existingUser) {
            if (!this.allowVerifiedEmailLinking) {
              throw new AccountLinkingNotAllowedError();
            }

            await transaction.oidcIdentity.create({
              data: {
                issuer: identity.issuer,
                subject: identity.subject,
                userId: existingUser.id,
                emailAtLink: email,
                emailVerifiedAt: verifiedAt,
              },
            });

            return this.toSafeUser(existingUser);
          }

          const user = await transaction.user.create({
            data: {
              email,
              emailVerifiedAt: verifiedAt,
            },
          });

          await transaction.oidcIdentity.create({
            data: {
              issuer: identity.issuer,
              subject: identity.subject,
              userId: user.id,
              emailAtLink: email,
              emailVerifiedAt: verifiedAt,
            },
          });

          return this.toSafeUser(user);
        });
      } catch (error) {
        if (this.isDomainError(error)) {
          throw error;
        }

        if (!this.isUniqueConstraintError(error)) {
          throw new IdentityCannotBeProvisionedError();
        }

        const winningUser = await this.findUserByIdentity(
          identity.issuer,
          identity.subject,
        );

        if (winningUser) {
          return this.toSafeUser(winningUser);
        }
      }
    }

    throw new IdentityCannotBeProvisionedError();
  }

  private requireVerifiedEmail(
    identity: ValidatedOidcToken,
  ): string {
    if (!identity.email || identity.emailVerified !== true) {
      throw new IdentityCannotBeProvisionedError();
    }

    const normalizedEmail = identity.email.trim().toLowerCase();

    if (!normalizedEmail) {
      throw new IdentityCannotBeProvisionedError();
    }

    return normalizedEmail;
  }

  private async findUserByIdentity(
    issuer: string,
    subject: string,
  ) {
    const identity = await this.prisma.oidcIdentity.findUnique({
      where: {
        issuer_subject: {
          issuer,
          subject,
        },
      },
      include: {
        user: true,
      },
    });

    return identity?.user ?? null;
  }

  private toSafeUser(user: {
    id: string;
    email: string;
    displayName: string | null;
  }): ReconciledOidcUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    );
  }

  private isDomainError(error: unknown): error is ReconciliationDomainError {
    return (
      error instanceof InvalidIdentityTokenError ||
      error instanceof IdentityCannotBeProvisionedError ||
      error instanceof AccountLinkingNotAllowedError
    );
  }
}
