import { test, expect } from "@playwright/test";
import { loginWithCredentials, loginWithSso } from "./utils";

test.describe("STRAAL-33 — login + logout", () => {
  test("credentials flow: valid demo user reaches the dashboard", async ({ page }) => {
    await loginWithCredentials(page, "demo@stratalign.dev", "password123");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /Welcome, Demo User/ })).toBeVisible();
  });

  test("credentials flow: wrong password shows an inline error and stays on /login", async ({ page }) => {
    await loginWithCredentials(page, "demo@stratalign.dev", "wrong-password", { expectSuccess: false });
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/email or password isn't right/i)).toBeVisible();
  });

  test("OIDC flow: real authorization-code + PKCE round trip against the mock IdP reaches the dashboard", async ({
    page,
  }) => {
    await loginWithSso(page, "member");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /Welcome, SSO Member/ })).toBeVisible();
  });

  test("logout clears the session and subsequent protected access redirects to login", async ({ page }) => {
    await loginWithCredentials(page, "demo@stratalign.dev", "password123");
    await expect(page).toHaveURL(/\/dashboard/);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fdashboard/);
  });

  test("unauthenticated access to a protected route redirects to login and preserves the destination", async ({
    page,
  }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fadmin/);

    // Signing in from here should land back on the originally requested page.
    await page.getByLabel("Email address").fill("admin@stratalign.dev");
    await page.getByLabel("Password", { exact: true }).fill("admin123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("a stale/invalid session cookie shows the session-expired banner and preserves the destination", async ({
    page,
    context,
  }) => {
    await loginWithCredentials(page, "demo@stratalign.dev", "password123");
    await expect(page).toHaveURL(/\/dashboard/);

    // Corrupt the session cookie in place to simulate an expired/invalid JWT
    // (as opposed to no cookie at all, which is the plain "please sign in" case).
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name.includes("session-token"));
    expect(sessionCookie).toBeTruthy();
    await context.addCookies([{ ...sessionCookie!, value: "corrupted-not-a-real-jwt" }]);

    await page.goto("/audit");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Faudit&error=SessionExpired/);
    await expect(page.getByRole("status")).toContainText(/session ended/i);
  });
});
