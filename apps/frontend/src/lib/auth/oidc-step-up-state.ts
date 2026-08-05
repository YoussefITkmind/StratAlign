import { createHmac, timingSafeEqual } from "node:crypto";

export const OIDC_STEP_UP_COOKIE = "stratalign.oidc-step-up";
const MAX_STEP_UP_STATE_AGE_MS = 5 * 60 * 1_000;

function signature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

export function createOidcStepUpState(
  expectedUserId: string,
  secret: string,
  now = Date.now(),
): string {
  const payload = Buffer.from(JSON.stringify({
    expectedUserId,
    expiresAt: now + MAX_STEP_UP_STATE_AGE_MS,
  })).toString("base64url");
  return `${payload}.${signature(payload, secret).toString("base64url")}`;
}

export function verifyOidcStepUpState(
  value: string,
  secret: string,
  now = Date.now(),
): string | null {
  try {
    const [payload, encodedSignature, extra] = value.split(".");
    if (!payload || !encodedSignature || extra) return null;
    const actual = Buffer.from(encodedSignature, "base64url");
    const expected = signature(payload, secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      expectedUserId?: unknown; expiresAt?: unknown;
    };
    if (
      typeof decoded.expectedUserId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(decoded.expectedUserId) ||
      typeof decoded.expiresAt !== "number" ||
      decoded.expiresAt < now ||
      decoded.expiresAt > now + MAX_STEP_UP_STATE_AGE_MS
    ) return null;
    return decoded.expectedUserId;
  } catch {
    return null;
  }
}
