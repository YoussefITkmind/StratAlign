import { test, expect } from "@playwright/test";
import { loginWithCredentials, completeStepUpIfPrompted } from "./utils";

test.describe("STRAAL-35 — audit log view", () => {
  test("an audited action (role grant) shows up with the right actor and timestamp", async ({ page }) => {
    const before = Date.now();

    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_CREDENTIAL_PASSWORD;
    if (!email || !password) {
      throw new Error("Real E2E credential fixtures are not configured");
    }

    await loginWithCredentials(page, email, password);
    await page.goto("/admin");
    await page.getByTestId("tab-grant").click();

    await page.getByLabel("User").selectOption({ label: "Alice Test User (alice@example.test)" });
    await page.getByLabel("Role").selectOption("strategy_analyst");
    await page.getByLabel("Org scope").fill("function:pw-audit-test");
    await page.getByTestId("grant-access").click();
    await completeStepUpIfPrompted(page, password);

    await expect(page.getByRole("cell", { name: "function:pw-audit-test" })).toBeVisible();

    await page.goto("/audit");
    await page.getByLabel("Actor").fill(email);
    await page.getByTestId("apply-audit-filter").click();

    const row = page
      .getByTestId("audit-rows")
      .getByRole("row")
      .filter({ hasText: "spm.api.call.completed" })
      .filter({ hasText: "iam.grantScope" })
      .first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(email);
    await expect(row).toContainText("iam.grantScope");

    const timestampText = await row.locator("td").nth(2).innerText();
    const rowTime = new Date(timestampText).getTime();
    expect(Number.isNaN(rowTime)).toBe(false);
    expect(rowTime).toBeGreaterThanOrEqual(before - 5000);
    expect(rowTime).toBeLessThanOrEqual(Date.now() + 5000);
  });
});
