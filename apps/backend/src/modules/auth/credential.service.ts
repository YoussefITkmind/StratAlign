import { PrismaService } from "../../database/prisma.service";
import {
  hashPassword,
  verifyPassword,
} from "./password.service";

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string | null;
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
}