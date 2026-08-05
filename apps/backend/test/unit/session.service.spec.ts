import { encode } from "@auth/core/jwt";
import { describe, expect, it } from "vitest";
import { SessionService } from "../../src/modules/auth/session.service";

const secret = "test-auth-secret-at-least-32-characters-long";
const cookieName = "authjs.session-token";

describe("SessionService", () => {
  const sessions = new SessionService(secret);

  it("returns a session for a valid Auth.js JWT", async () => {
    const authenticationTime = Date.now() - 1_000;
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const token = await encode({
      secret,
      salt: cookieName,
      maxAge: 900,
      token: {
        sub: "user-1",
        email: "alice@example.test",
        name: "Alice Test User",
        authenticationTime,
        sessionId,
        authenticationMethod: "credentials",
      },
    });

    await expect(
      sessions.getSession({
        headers: {
          cookie: `${cookieName}=${token}`,
        },
      }),
    ).resolves.toMatchObject({
      user: {
        id: "user-1",
        email: "alice@example.test",
        name: "Alice Test User",
      },
      authenticatedAt: new Date(authenticationTime),
      sessionId,
      expiresAt: expect.any(Date),
      authenticationMethod: "credentials",
    });
  });

  it("fails closed when private session claims are missing or malformed", async () => {
    for (const privateClaims of [
      { authenticationTime: Date.now() },
      { authenticationTime: Date.now(), sessionId: "browser-controlled" },
    ]) {
      const token = await encode({
        secret, salt: cookieName, maxAge: 900,
        token: { sub: "user-1", ...privateClaims },
      });
      await expect(sessions.getSession({
        headers: { cookie: `${cookieName}=${token}` },
      })).resolves.toBeNull();
    }
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
