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

export async function loginAs(
  page: Page,
  role: "platform_administrator" | "member",
) {
  const emailVariable = role === "platform_administrator"
    ? "E2E_ADMIN_EMAIL"
    : "E2E_MEMBER_EMAIL";
  const email = process.env[emailVariable];
  const password = process.env.E2E_CREDENTIAL_PASSWORD;

  if (!email || !password) {
    throw new Error("Real E2E credential fixtures are not configured");
  }

  await loginWithCredentials(page, email, password);
}

/**
 * Drives the real "Continue with SSO" button through the mock IdP
 * — a genuine authorization-code + PKCE redirect chain against the configured
 * local provider,
 * not a stubbed session. `subject` picks which mock IdP-side identity to
 * authenticate as.
 */
export async function loginWithSso(page: Page, subject: "member" | "admin", from = "/login") {
  await page.goto(from);
  await page.getByRole("button", { name: "Continue with SSO" }).click();
  await page.waitForURL((url) => url.port === "8092");
  const authorizationUrl = new URL(page.url());
  expect(authorizationUrl.searchParams.get("state")).toBeTruthy();
  expect(authorizationUrl.searchParams.get("code_challenge")).toBeTruthy();
  expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
  await page.locator("select[name=sub]").selectOption(subject === "admin" ? "foo" : "bar");
  await page.getByRole("button", { name: "Authorize" }).click();
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
