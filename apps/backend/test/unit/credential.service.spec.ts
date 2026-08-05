import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PrismaService } from "../../src/database/prisma.service";
import {
  CredentialService,
  type AuthenticatedUser,
} from "../../src/modules/auth/credential.service";
import { hashPassword } from "../../src/modules/auth/password.service";

describe("CredentialService", () => {
  const findUnique = vi.fn();

  const prisma = {
    localCredential: {
      findUnique,
    },
  } as unknown as PrismaService;

  let credentialService: CredentialService;
  let validPasswordHash: string;

  const expectedUser: AuthenticatedUser = {
    id: "user-1",
    email: "alice@example.test",
    displayName: "Alice Test User",
  };

  beforeAll(async () => {
    credentialService =
      await CredentialService.create(prisma);

    validPasswordHash = await hashPassword(
      "LocalTestPassword123!",
    );
  });

  beforeEach(() => {
    findUnique.mockReset();
  });

  it("returns the user for valid credentials", async () => {
    findUnique.mockResolvedValue({
      passwordHash: validPasswordHash,
      user: expectedUser,
    });

    await expect(
      credentialService.authenticate(
        " Alice@Example.Test ",
        "LocalTestPassword123!",
      ),
    ).resolves.toEqual(expectedUser);

    expect(findUnique).toHaveBeenCalledWith({
      where: {
        email: "alice@example.test",
      },
      include: {
        user: true,
      },
    });
  });

  it("returns null for an incorrect password", async () => {
    findUnique.mockResolvedValue({
      passwordHash: validPasswordHash,
      user: expectedUser,
    });

    await expect(
      credentialService.authenticate(
        "alice@example.test",
        "WrongPassword123!",
      ),
    ).resolves.toBeNull();
  });

  it("returns null for an unknown email", async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      credentialService.authenticate(
        "unknown@example.test",
        "LocalTestPassword123!",
      ),
    ).resolves.toBeNull();
  });
});