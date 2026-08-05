/**
 * Auth-related constants shared across the login/logout UI.
 *
 * SYNC WITH PERSON A: `SSO_PROVIDER_ID` must match the `id` Person A configures
 * on the generic OIDC provider in the Auth.js config (Prompt 1.1, step 1a).
 * Confirm the exact string as soon as 1.1 is stable — do not guess in prod.
 */
export const SSO_PROVIDER_ID = "generic-oidc" as const;
export const CREDENTIALS_PROVIDER_ID = "credentials" as const;

export const ROUTES = {
  login: "/login",
  createAccount: "/register",
  forgotPassword: "/forgot-password",
  defaultAfterLogin: "/dashboard",
} as const;

/** Query param Auth.js/session-expiry middleware should attach on forced redirects. */
export const SESSION_EXPIRED_ERROR_CODE = "SessionExpired";
