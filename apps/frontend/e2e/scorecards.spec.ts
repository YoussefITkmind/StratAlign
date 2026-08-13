import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { test, expect } from "@playwright/test";

import { loginAs } from "./utils";

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(__dirname, "../../..");

interface ScorecardFixture {
  scorecardId: string;
  revenueKpiDefinitionId: string;
  csatKpiDefinitionId: string;
}

async function seedScorecardFixture(): Promise<ScorecardFixture> {
  const result = await execFileAsync(
    "pnpm",
    ["--filter", "@spm/backend", "exec", "tsx", "prisma/e2e-scorecard-seed.ts"],
    { cwd: workspaceRoot, env: process.env },
  );
  const line = result.stdout.trim().split("\n").at(-1);
  if (!line) throw new Error("Scorecard E2E seed produced no output");
  return JSON.parse(line) as ScorecardFixture;
}

test.describe("Master Scorecard — screen 03, real Prompt 3.1 data", () => {
  let fixture: ScorecardFixture;

  test.beforeAll(async () => {
    fixture = await seedScorecardFixture();
  });

  test("reflects the real active WeightingVersion's computed score and perspective weights", async ({ page }) => {
    await loginAs(page, "member");
    await page.goto(`/balanced-scorecards/${fixture.scorecardId}`);

    const scorecardPage = page.getByTestId("master-scorecard-page");
    await expect(scorecardPage).toBeVisible();

    // Financial (weight 60, Revenue on_track) + Customer (weight 40, CSAT
    // off_track) through the real published RAG_AGGREGATION rule computes to
    // 60% — this is a live rule evaluation against seeded StatusResult rows,
    // not a hardcoded UI value.
    await expect(page.getByTestId("overall-score")).toHaveText("60%");

    const statusCounts = page.getByTestId("status-counts");
    await expect(statusCounts).toContainText("On Track");
    await expect(statusCounts).toContainText("Off Track");

    const financialColumn = page.locator('[data-testid^="perspective-column-"]', { hasText: "Financial" });
    await expect(financialColumn).toBeVisible();
    await expect(financialColumn).toContainText("60% weight");

    const customerColumn = page.locator('[data-testid^="perspective-column-"]', { hasText: "Customer" });
    await expect(customerColumn).toBeVisible();
    await expect(customerColumn).toContainText("40% weight");

    await expect(financialColumn).toContainText("Grow Revenue");
    await expect(financialColumn).toContainText("On Track");
    await expect(customerColumn).toContainText("Improve Customer Satisfaction");
    await expect(customerColumn).toContainText("Off Track");
  });

  test("grid/map toggle renders the scorecard's real published StrategyMap, then switches back", async ({ page }) => {
    await loginAs(page, "member");
    await page.goto(`/balanced-scorecards/${fixture.scorecardId}`);

    await expect(page.getByTestId("perspective-columns")).toBeVisible();

    await page.getByTestId("view-toggle-map").click();
    const mapView = page.getByTestId("scorecard-map-view");
    await expect(mapView).toBeVisible();
    await expect(page.getByTestId("perspective-columns")).toHaveCount(0);
    await expect(mapView).toContainText("Grow Revenue");
    await expect(mapView).toContainText("Improve Customer Satisfaction");
    await expect(mapView).toContainText("strong");

    await page.getByTestId("view-toggle-grid").click();
    await expect(page.getByTestId("perspective-columns")).toBeVisible();
  });

  test("a scorecard id that doesn't resolve shows an honest not-found state, not a broken or faked page", async ({ page }) => {
    await loginAs(page, "member");
    await page.goto("/balanced-scorecards/00000000-0000-4000-8000-000000000000");
    await expect(page.getByTestId("master-scorecard-not-found")).toBeVisible();
  });

  // The blocking review comment on the prior version of this PR required proof
  // that Master Scorecard and KPI Detail render the SAME status/color for the
  // SAME underlying KPI, off the same real Phase 2 data — not two disconnected
  // datasets. The seeded Revenue KPI is placed on the scorecard (via
  // Placement -> Alignment) and independently readable through capture.detail
  // (via the same Alignment -> KpiVersion -> StatusResult chain), so this
  // walks both real screens for that one KPI and compares the rendered badge
  // text and the shared RAG_STATUS_TOKENS color class.
  test("Master Scorecard and KPI Detail show identical status and color for the same real KPI", async ({ page }) => {
    await loginAs(page, "member");
    await page.goto(`/balanced-scorecards/${fixture.scorecardId}`);

    const financialColumn = page.locator('[data-testid^="perspective-column-"]', { hasText: "Financial" });
    const scorecardBadge = financialColumn.locator('[data-testid^="objective-status-"]').first();
    await expect(scorecardBadge).toHaveText("On Track");
    await expect(scorecardBadge).toHaveClass(/bg-emerald-50/);
    await expect(scorecardBadge).toHaveClass(/text-emerald-700/);

    await page.goto("/kpis-okrs");
    await page.getByRole("button", { name: "KPI Library" }).click();
    const revenueRow = page.getByTestId("persisted-kpi-row").filter({ hasText: "E2E Revenue Growth" });
    await expect(revenueRow).toBeVisible();
    await revenueRow.locator("..").getByRole("button", { name: "Open KPI Detail" }).click();

    await expect(page.getByRole("heading", { name: "E2E Revenue Growth" })).toBeVisible();
    const kpiDetailBadge = page.locator("span", { hasText: "On Track" }).first();
    await expect(kpiDetailBadge).toBeVisible();
    await expect(kpiDetailBadge).toHaveClass(/bg-emerald-50/);
    await expect(kpiDetailBadge).toHaveClass(/text-emerald-700/);
  });
});

test.describe("Master Scorecard — RTL", () => {
  test("summary band and perspective columns render correctly mirrored in Arabic", async ({ page, context }) => {
    const fixture = await seedScorecardFixture();
    await loginAs(page, "member");
    await context.addCookies([{ name: "stratalign_locale", value: "ar", url: page.url() }]);
    await page.goto(`/balanced-scorecards/${fixture.scorecardId}`);

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByTestId("summary-band")).toBeVisible();
    await expect(page.locator('[data-testid^="perspective-column-"]').first()).toBeVisible();

    // The back-link chevron is explicitly flipped for RTL (rtl:rotate-180) since icons
    // don't auto-mirror the way logical-property layout does — confirm the CSS actually
    // applies, not just that the class string is present.
    const transform = await page
      .locator('a[href="/balanced-scorecards"] svg')
      .first()
      .evaluate((el) => getComputedStyle(el).transform);
    expect(transform).not.toBe("none");
  });
});
