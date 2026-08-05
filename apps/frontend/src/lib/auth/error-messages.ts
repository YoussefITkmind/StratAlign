import { SESSION_EXPIRED_ERROR_CODE } from "./constants";

/**
 * Central place to translate error codes coming back from Auth.js's `signIn()`
 * result, or from the `error` search param on a redirect, into copy shown in
 * the login form. Keep this in sync with whatever codes Person A's
 * `withAuthn` / credentials provider actually throws (Prompt 1.1) — the two
 * below (`CredentialsSignin`, `SessionExpired`) are the two guaranteed by the
 * spec; extend this map rather than branching in the component.
 */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "That email or password isn't right. Try again.",
  [SESSION_EXPIRED_ERROR_CODE]: "Your session ended. Sign in again to continue.",
  RateLimited: "Too many attempts. Wait a few minutes and try again.",
  OAuthSignin: "The SSO provider couldn't be reached. Try again in a moment.",
  OAuthCallback: "The SSO sign-in didn't complete. Try again.",
  AccessDenied: "Your account doesn't have access to this workspace.",
  Default: "Something went wrong signing you in. Try again.",
};

export function getAuthErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return AUTH_ERROR_MESSAGES[code] ?? AUTH_ERROR_MESSAGES.Default;
}
