import { expect, type Page } from "@playwright/test";

export async function loginWithCredentials(
  page: Page,
  email: string,
  password: string,
  opts: { expectSuccess?: boolean } = {}
) {
  const { expectSuccess = true } = opts;
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  if (expectSuccess) {
    // The submit handler awaits signIn() client-side before router.push —
    // wait for that navigation so the session cookie is actually set before
    // the caller's next action (e.g. a direct API call) runs.
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 10_000 });
  }
}

/**
 * Drives the real "Continue with SSO" button through the mock IdP
 * (app/api/mock-idp/*) — a genuine authorization-code + PKCE redirect chain,
 * not a stubbed session. `subject` picks which mock IdP-side identity to
 * authenticate as.
 */
export async function loginWithSso(page: Page, subject: "member" | "admin", from = "/login") {
  await page.goto(from);
  await page.getByRole("button", { name: "Continue with SSO" }).click();
  await page.getByTestId(`mock-idp-${subject}`).click();
}

/**
 * Step-up re-verification stays fresh server-side for 5 minutes per user
 * (see requireStepUp in server/trpc.ts), independent of the browser session
 * cookie — so a sensitive action in one test may or may not need a fresh
 * step-up depending on what ran moments earlier in the same suite. Complete
 * the modal only if it actually shows up.
 */
export async function completeStepUpIfPrompted(page: Page, password: string) {
  const modal = page.getByRole("dialog", { name: "Confirm it's you" });
  if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByTestId("step-up-verify").click();
    await expect(modal).not.toBeVisible();
  }
}
