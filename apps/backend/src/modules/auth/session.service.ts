import { getToken, type JWT } from "@auth/core/jwt";

const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
] as const;

export interface AuthenticatedSession {
  user: {
    id: string;
    email: string | null;
    name: string | null;
  };
  authenticatedAt: Date;
  sessionId: string;
  expiresAt: Date;
  authenticationMethod: "credentials" | "oidc" | null;
}

export interface SessionRequest {
  headers: Headers | Record<string, string>;
}

export class SessionService {
  constructor(private readonly secret: string) {}

  async getSession(
    request: SessionRequest,
  ): Promise<AuthenticatedSession | null> {
    for (const cookieName of SESSION_COOKIE_NAMES) {
      const token = await getToken({
        req: request,
        secret: this.secret,
        cookieName,
        salt: cookieName,
      });

      const session = this.toSession(token);

      if (session) {
        return session;
      }
    }

    return null;
  }

  private toSession(
    token: JWT | null,
  ): AuthenticatedSession | null {
    if (typeof token?.sub !== "string" || token.sub.length === 0) {
      return null;
    }

    const authenticationTime = token.authenticationTime;
    const expiresAt = typeof token.exp === "number" ? token.exp * 1_000 : Number.NaN;
    if (
      typeof authenticationTime !== "number" ||
      !Number.isFinite(authenticationTime) ||
      typeof token.sessionId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token.sessionId) ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now() ||
      authenticationTime <= 0 ||
      authenticationTime > Date.now() + 5_000 ||
      authenticationTime >= expiresAt
    ) {
      return null;
    }

    return {
      user: {
        id: token.sub,
        email:
          typeof token.email === "string" ? token.email : null,
        name:
          typeof token.name === "string" ? token.name : null,
      },
      authenticatedAt: new Date(authenticationTime),
      sessionId: token.sessionId,
      expiresAt: new Date(expiresAt),
      authenticationMethod:
        token.authenticationMethod === "credentials" || token.authenticationMethod === "oidc"
          ? token.authenticationMethod
          : null,
    };
  }
}
