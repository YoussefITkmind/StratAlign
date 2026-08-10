import { test, expect } from "@playwright/test";
import { loginAs } from "./utils";

test.describe("STRAAL-36 — approvals inbox", () => {
  test("lists pending approvals, excludes the viewer's own submission, and shows the escalated case", async ({
    page,
  }) => {
    await loginAs(page, "platform_administrator");
    await page.goto("/approvals");

    const list = page.getByTestId("approvals-list");
    // Seeded case-seed-role-grant was submitted by admin@stratalign.dev — must not appear.
    await expect(list.getByText("role_grant")).toHaveCount(0);
    // Seeded case-seed-group-mapping was submitted by demo@stratalign.dev and is escalated.
    await expect(list.getByText("group_role_mapping_change")).toBeVisible();
    await expect(list.getByTestId("escalated-badge")).toBeVisible();
  });

  test("case detail shows the before/after diff and approving it succeeds", async ({ page }) => {
    await loginAs(page, "platform_administrator");
    await page.goto("/approvals/case-seed-group-mapping");

    await expect(page.getByRole("cell", { name: "stratalign-analysts" }).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: "member" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "platform_administrator" })).toBeVisible();

    await page.getByTestId("approve-case").click();
    await expect(page.getByTestId("decision-badge")).toContainText("Approved");
  });

  test("separation of duties: the submitter cannot approve their own case, even navigating there directly", async ({
    page,
  }) => {
    await loginAs(page, "platform_administrator");
    // case-seed-role-grant was submitted by admin@stratalign.dev (this session) —
    // navigate straight to it, bypassing the list where it's correctly hidden.
    await page.goto("/approvals/case-seed-role-grant");

    await page.getByTestId("approve-case").click();
    await expect(page.getByTestId("decision-error")).toContainText(
      /cannot decide it yourself/i
    );

    // Direct procedure call must reject it too, not just the button in the UI.
    const response = await page.request.post("/api/trpc/governance.decide", {
      data: { json: { id: "case-seed-role-grant", decision: "approved" } },
    });
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error.json.data.ownSubmission).toBe(true);
  });
});
