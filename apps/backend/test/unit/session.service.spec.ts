import { encode } from "@auth/core/jwt";
import { describe, expect, it } from "vitest";
import { SessionService } from "../../src/modules/auth/session.service";

const secret = "test-auth-secret-at-least-32-characters-long";
const cookieName = "authjs.session-token";

describe("SessionService", () => {
  const sessions = new SessionService(secret);

  it("returns a session for a valid Auth.js JWT", async () => {
    const token = await encode({
      secret,
      salt: cookieName,
      maxAge: 900,
      token: {
        sub: "user-1",
        email: "alice@example.test",
        name: "Alice Test User",
      },
    });

    await expect(
      sessions.getSession({
        headers: {
          cookie: `${cookieName}=${token}`,
        },
      }),
    ).resolves.toEqual({
      user: {
        id: "user-1",
        email: "alice@example.test",
        name: "Alice Test User",
      },
    });
  });

  it("returns null when the session token is missing", async () => {
    await expect(
      sessions.getSession({ headers: {} }),
    ).resolves.toBeNull();
  });

  it("returns null for invalid or expired session tokens", async () => {
    const expiredToken = await encode({
      secret,
      salt: cookieName,
      maxAge: -60,
      token: { sub: "user-1" },
    });

    await expect(
      sessions.getSession({
        headers: {
          cookie: `${cookieName}=invalid-token`,
        },
      }),
    ).resolves.toBeNull();

    await expect(
      sessions.getSession({
        headers: {
          cookie: `${cookieName}=${expiredToken}`,
        },
      }),
    ).resolves.toBeNull();
  });
});
