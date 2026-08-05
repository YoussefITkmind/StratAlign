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

    return {
      user: {
        id: token.sub,
        email:
          typeof token.email === "string" ? token.email : null,
        name:
          typeof token.name === "string" ? token.name : null,
      },
    };
  }
}
