import { createHmac } from "node:crypto";
import type Redis from "ioredis";
import type { AuthenticatedSession } from "../auth/session.service";

export class AuthenticationFreshnessService {
  constructor(private readonly redis: Redis, private readonly secret: string) {}

  async record(session: AuthenticatedSession, authenticatedAt = new Date()): Promise<void> {
    const remainingSeconds = Math.floor(
      (session.expiresAt.getTime() - authenticatedAt.getTime()) / 1_000,
    );
    if (remainingSeconds <= 0) return;
    await this.redis.set(
      this.key(session),
      String(authenticatedAt.getTime()),
      "EX",
      remainingSeconds,
    );
  }

  async resolve(session: AuthenticatedSession): Promise<Date> {
    if (session.expiresAt.getTime() <= Date.now()) return session.authenticatedAt;
    const stored = await this.redis.get(this.key(session));
    const storedMilliseconds = stored === null ? Number.NaN : Number(stored);
    if (
      !Number.isFinite(storedMilliseconds) ||
      storedMilliseconds > session.expiresAt.getTime()
    ) return session.authenticatedAt;
    return new Date(Math.max(session.authenticatedAt.getTime(), storedMilliseconds));
  }

  private key(session: AuthenticatedSession): string {
    const fingerprint = createHmac("sha256", this.secret)
      .update(`step-up\0${session.user.id}\0${session.sessionId}`)
      .digest("hex");
    return `iam:authentication-freshness:${fingerprint}`;
  }
}
