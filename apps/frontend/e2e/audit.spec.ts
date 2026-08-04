import { test, expect } from "@playwright/test";
import { loginWithCredentials, completeStepUpIfPrompted } from "./utils";

test.describe("STRAAL-35 — audit log view", () => {
  test("an audited action (role grant) shows up with the right actor and timestamp", async ({ page }) => {
    const before = Date.now();

    await loginWithCredentials(page, "admin@stratalign.dev", "admin123");
    await page.goto("/admin");
    await page.getByTestId("tab-grant").click();

    await page.getByLabel("User").selectOption({ label: "Demo User (demo@stratalign.dev)" });
    await page.getByLabel("Org scope").fill("org:pw-audit-test");
    await page.getByTestId("grant-access").click();
    await completeStepUpIfPrompted(page, "admin123");

    await expect(page.getByRole("cell", { name: "org:pw-audit-test" })).toBeVisible();

    await page.goto("/audit");
    await page.getByLabel("Actor").fill("admin@stratalign.dev");
    await page.getByTestId("apply-audit-filter").click();

    const row = page.getByTestId("audit-rows").getByRole("row").filter({
      hasText: "iam.user_role_grant.created",
    });
    await expect(row).toBeVisible();
    await expect(row).toContainText("admin@stratalign.dev");

    const timestampText = await row.locator("td").nth(2).innerText();
    const rowTime = new Date(timestampText).getTime();
    expect(Number.isNaN(rowTime)).toBe(false);
    expect(rowTime).toBeGreaterThanOrEqual(before - 5000);
    expect(rowTime).toBeLessThanOrEqual(Date.now() + 5000);
  });
});
