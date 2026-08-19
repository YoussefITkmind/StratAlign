import { PrismaService } from "../../database/prisma.service";
import { isUniqueConstraintViolation } from "../../errors/app.errors";
import {
  hashPassword,
  verifyPassword,
} from "./password.service";

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string | null;
}

export class EmailAlreadyRegisteredError extends Error {
  readonly code = "EMAIL_ALREADY_REGISTERED";

  constructor() {
    super("An account with this email already exists.");
    this.name = "EmailAlreadyRegisteredError";
  }
}

export class CredentialService {
  private constructor(
    private readonly prisma: PrismaService,
    private readonly dummyPasswordHash: string,
  ) {}

  static async create(
    prisma: PrismaService,
  ): Promise<CredentialService> {
    const dummyPasswordHash = await hashPassword(
      "DummyPasswordThatCannotAuthenticate123!",
    );

    return new CredentialService(
      prisma,
      dummyPasswordHash,
    );
  }

  async authenticate(
    email: string,
    password: string,
  ): Promise<AuthenticatedUser | null> {
    const normalizedEmail = email.trim().toLowerCase();

    const credential =
      await this.prisma.localCredential.findUnique({
        where: {
          email: normalizedEmail,
        },
        include: {
          user: true,
        },
      });

    const passwordHash =
      credential?.passwordHash ?? this.dummyPasswordHash;

    const passwordIsValid = await verifyPassword(
      passwordHash,
      password,
    );

    if (!credential || !passwordIsValid) {
      return null;
    }

    return {
      id: credential.user.id,
      email: credential.user.email,
      displayName: credential.user.displayName,
    };
  }

  async register(
    email: string,
    password: string,
    displayName: string,
  ): Promise<AuthenticatedUser> {
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await this.prisma.localCredential.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    if (existing) {
      throw new EmailAlreadyRegisteredError();
    }

    const passwordHash = await hashPassword(password);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          displayName: displayName.trim(),
          localCredential: {
            create: {
              email: normalizedEmail,
              passwordHash,
            },
          },
        },
      });

      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      };
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new EmailAlreadyRegisteredError();
      }
      throw error;
    }
  }
}