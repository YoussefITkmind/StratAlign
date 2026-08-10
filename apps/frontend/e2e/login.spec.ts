import { test, expect } from "@playwright/test";
import { loginAs, loginWithCredentials, loginWithSso } from "./utils";

test.describe("STRAAL-33 — login + logout", () => {
  test("credentials flow: valid demo user reaches the dashboard", async ({ page }) => {
    const credentialPost = page.waitForRequest((request) =>
      request.method() === "POST" && request.url().includes("/callback/credentials"),
    );
    await loginAs(page, "member");
    const submitted = new URLSearchParams((await credentialPost).postData() ?? "");
    expect(submitted.get("csrfToken")).toBeTruthy();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /Welcome,/ })).toBeVisible();

    const sessionCookie = (await page.context().cookies()).find((cookie) =>
      cookie.name.includes("session-token"),
    );
    expect(sessionCookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });
  });

  test("credentials flow: wrong password shows an inline error and stays on /login", async ({ page }) => {
    const email = process.env.E2E_MEMBER_EMAIL;
    if (!email) throw new Error("Real E2E credential fixtures are not configured");
    await loginWithCredentials(page, email, "intentionally-wrong-password", { expectSuccess: false });
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/email or password isn't right/i)).toBeVisible();
  });

  test("OIDC flow: real authorization-code + PKCE round trip against the mock IdP reaches the dashboard", async ({
    page,
  }) => {
    await loginWithSso(page, "member");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /Welcome,/ })).toBeVisible();

    const session = await page.request.get("/api/auth/session");
    const body = await session.json() as Record<string, unknown>;
    const user = body.user as { id?: unknown } | undefined;
    expect(user?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(JSON.stringify(body)).not.toMatch(
      /id_token|access_token|refresh_token|oidcAccessToken|oidcRefreshToken/,
    );

    await page.getByRole("banner").getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("logout clears the session and subsequent protected access redirects to login", async ({ page }) => {
    await loginAs(page, "member");
    await expect(page).toHaveURL(/\/dashboard/);

    await page.getByRole("banner").getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fdashboard/);
  });

  test("unauthenticated access to a protected route redirects to login and preserves the destination", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fdashboard/);

    // Signing in from here should land back on the originally requested page.
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_CREDENTIAL_PASSWORD;
    if (!email || !password) throw new Error("Real E2E credential fixtures are not configured");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("a stale/invalid session cookie shows the session-expired banner and preserves the destination", async ({
    page,
    context,
  }) => {
    await loginAs(page, "member");
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
