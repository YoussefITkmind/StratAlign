import { test, expect } from "@playwright/test";
import { loginAs, loginWithSso } from "./utils";

test.describe("STRAAL-34 — admin UI (role mapping, grants, step-up)", () => {
  test("admin completes step-up and the sensitive action proceeds", async ({ page }) => {
    await loginAs(page, "platform_administrator");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible();
    await page.waitForTimeout(5_500);

    const groupName = `pw-test-group-${Date.now()}`;
    await page.getByLabel("Group name").fill(groupName);
    await page.getByLabel("Role").selectOption("strategy_analyst");
    await page.getByLabel("Org scope").fill("function:pw-test");
    await page.getByTestId("save-mapping").click();

    // Sensitive mutation should be blocked pending step-up, not silently succeed.
    const modal = page.getByRole("dialog", { name: "Confirm it's you" });
    await expect(modal).toBeVisible();

    const password = process.env.E2E_CREDENTIAL_PASSWORD;
    if (!password) throw new Error("Real E2E credential fixtures are not configured");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByTestId("step-up-verify").click();
    await expect(modal).not.toBeVisible();

    // The mutation that triggered step-up re-runs automatically — no full logout.
    await expect(page.getByRole("cell", { name: groupName })).toBeVisible();
  });

  test("non-admin is blocked at the UI: access denied, no admin/approvals nav", async ({ page }) => {
    await loginAs(page, "member");
    await page.goto("/admin");
    await expect(page.getByText("Access denied")).toBeVisible();

    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Approvals" })).toHaveCount(0);
  });

  test("non-admin is blocked at the procedure level, not just hidden nav", async ({ page }) => {
    await loginAs(page, "member");

    const response = await page.request.get("/api/trpc/iam.listGroupRoleMappings");
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.json.data.code).toBe("FORBIDDEN");
  });

  test("OIDC-only admin completes forced provider step-up and resumes the action", async ({ page }) => {
    await loginWithSso(page, "admin");
    await page.waitForURL("**/dashboard");
    await page.goto("/admin");
    await page.waitForTimeout(5_500);
    const groupName = `pw-oidc-step-up-${Date.now()}`;
    await page.getByLabel("Group name").fill(groupName);
    await page.getByLabel("Role").selectOption("strategy_analyst");
    await page.getByLabel("Org scope").fill("function:pw-oidc");
    await page.getByTestId("save-mapping").click();

    const modal = page.getByRole("dialog", { name: "Confirm it's you" });
    await expect(modal).toBeVisible();
    const providerRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.port === "8092" && url.pathname.includes("authorize");
    });
    await page.getByTestId("step-up-verify").click();
    const authorizationUrl = new URL((await providerRequest).url());
    expect(authorizationUrl.searchParams.get("prompt")).toBe("login");
    expect(authorizationUrl.searchParams.get("max_age")).toBe("0");
    expect(authorizationUrl.searchParams.get("state")).toBeTruthy();
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    if (new URL(page.url()).port === "8092") {
      await page.locator("select[name=sub]").selectOption("foo");
      await page.getByRole("button", { name: "Authorize" }).click();
    }

    await expect(page.getByRole("cell", { name: groupName })).toBeVisible();
  });
});
