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
  EmailAlreadyRegisteredError,
  type AuthenticatedUser,
} from "../../src/modules/auth/credential.service";
import { hashPassword } from "../../src/modules/auth/password.service";

describe("CredentialService", () => {
  const findUnique = vi.fn();
  const userCreate = vi.fn();

  const prisma = {
    localCredential: {
      findUnique,
    },
    user: {
      create: userCreate,
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
    userCreate.mockReset();
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

  describe("register", () => {
    it("creates a user and credential for a new email", async () => {
      findUnique.mockResolvedValue(null);
      userCreate.mockResolvedValue({
        id: "user-2",
        email: "bob@example.test",
        displayName: "Bob Test User",
      });

      await expect(
        credentialService.register(
          " Bob@Example.Test ",
          "LocalTestPassword123!",
          " Bob Test User ",
        ),
      ).resolves.toEqual({
        id: "user-2",
        email: "bob@example.test",
        displayName: "Bob Test User",
      });

      expect(findUnique).toHaveBeenCalledWith({
        where: { email: "bob@example.test" },
      });

      const createArgs = userCreate.mock.calls[0][0];
      expect(createArgs.data.email).toBe("bob@example.test");
      expect(createArgs.data.displayName).toBe("Bob Test User");
      expect(createArgs.data.localCredential.create.email).toBe(
        "bob@example.test",
      );
      expect(createArgs.data.localCredential.create.passwordHash).not.toBe(
        "LocalTestPassword123!",
      );
    });

    it("rejects an email that is already registered", async () => {
      findUnique.mockResolvedValue({
        userId: "user-1",
        email: "alice@example.test",
      });

      await expect(
        credentialService.register(
          "alice@example.test",
          "LocalTestPassword123!",
          "Alice Test User",
        ),
      ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);

      expect(userCreate).not.toHaveBeenCalled();
    });

    it("rejects a concurrent duplicate caught only by the database", async () => {
      findUnique.mockResolvedValue(null);
      userCreate.mockRejectedValue({ code: "P2002" });

      await expect(
        credentialService.register(
          "bob@example.test",
          "LocalTestPassword123!",
          "Bob Test User",
        ),
      ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    });
  });
});