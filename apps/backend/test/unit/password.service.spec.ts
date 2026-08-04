import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
} from "../../src/modules/auth/password.service";

describe("password service", () => {
  it("creates an Argon2id hash and verifies the correct password", async () => {
    const password = "LocalTestPassword123!";
    const passwordHash = await hashPassword(password);

    expect(passwordHash.startsWith("$argon2id$")).toBe(true);
    await expect(
      verifyPassword(passwordHash, password),
    ).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const passwordHash = await hashPassword(
      "CorrectPassword123!",
    );

    await expect(
      verifyPassword(passwordHash, "WrongPassword123!"),
    ).resolves.toBe(false);
  });

  it("returns false for an invalid stored hash", async () => {
    await expect(
      verifyPassword("invalid-hash", "Password123!"),
    ).resolves.toBe(false);
  });
});