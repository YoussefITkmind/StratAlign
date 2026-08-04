import { test, expect } from "@playwright/test";
import { loginWithCredentials } from "./utils";

test.describe("STRAAL-34 — admin UI (role mapping, grants, step-up)", () => {
  test("admin completes step-up and the sensitive action proceeds", async ({ page }) => {
    await loginWithCredentials(page, "admin@stratalign.dev", "admin123");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible();

    const groupName = `pw-test-group-${Date.now()}`;
    await page.getByLabel("Group name").fill(groupName);
    await page.getByLabel("Org scope").fill("org:pw-test");
    await page.getByTestId("save-mapping").click();

    // Sensitive mutation should be blocked pending step-up, not silently succeed.
    const modal = page.getByRole("dialog", { name: "Confirm it's you" });
    await expect(modal).toBeVisible();

    await page.getByLabel("Password", { exact: true }).fill("admin123");
    await page.getByTestId("step-up-verify").click();
    await expect(modal).not.toBeVisible();

    // The mutation that triggered step-up re-runs automatically — no full logout.
    await expect(page.getByRole("cell", { name: groupName })).toBeVisible();
  });

  test("non-admin is blocked at the UI: access denied, no admin/approvals nav", async ({ page }) => {
    await loginWithCredentials(page, "demo@stratalign.dev", "password123");
    await page.goto("/admin");
    await expect(page.getByText("Access denied")).toBeVisible();

    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Approvals" })).toHaveCount(0);
  });

  test("non-admin is blocked at the procedure level, not just hidden nav", async ({ page }) => {
    await loginWithCredentials(page, "demo@stratalign.dev", "password123");

    const response = await page.request.get("/api/trpc/iam.listGroupRoleMappings");
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.json.data.code).toBe("FORBIDDEN");
  });
});
