import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { test, expect } from "@playwright/test";
import { loginAs } from "./utils";

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(__dirname, "../../..");

interface ScorecardFixture {
  scorecardId: string;
  aliceId: string;
  bobId: string;
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

async function trpcJson(page: import("@playwright/test").Page, procedure: string, input: unknown) {
  const response = await page.request.post(`/api/trpc/${procedure}`, { data: { json: input } });
  const body = await response.json();
  return { status: response.status(), body };
}

test.describe("Home landing — screen 02", () => {
  test.describe.configure({ mode: "serial" });

  let fixture: ScorecardFixture;

  test.beforeAll(async () => {
    fixture = await seedScorecardFixture();
  });

  test("executive_viewer sees the executive widget composition, populated with real Prompt 3.1/3.2/3.3/1.5 data", async ({ page }) => {
    await loginAs(page, "executive_viewer");
    await page.goto("/overview");

    await expect(page.getByTestId("home-page")).toBeVisible();
    await expect(page.getByTestId("home-role-label")).toHaveText("Executive viewer");

    await expect(page.getByTestId("widget-kpi-tiles")).toBeVisible();
    await expect(page.getByTestId("widget-exceptions")).toBeVisible();
    await expect(page.getByTestId("widget-scorecard-strip")).toBeVisible();
    await expect(page.getByTestId("widget-review-calendar")).toBeVisible();
    await expect(page.getByTestId("widget-map-thumbnail")).toBeVisible();

    // kpi_owner-only widgets must not leak into this composition.
    await expect(page.getByTestId("widget-owned-kpis")).toHaveCount(0);
    await expect(page.getByTestId("widget-due-submissions")).toHaveCount(0);

    // Real scorecard.get + weighting.preview data — the same seeded scorecard
    // from e2e-scorecard-seed.ts, computed live, not a fixture percentage.
    const strip = page.getByTestId(`scorecard-strip-item-${fixture.scorecardId}`);
    await expect(strip).toBeVisible();
    await expect(page.getByTestId(`scorecard-strip-score-${fixture.scorecardId}`)).toHaveText("60%");

    // The real published Prompt 3.3 map for that scorecard.
    await expect(page.getByTestId("map-thumbnail-list")).toContainText("Grow Revenue");
    await expect(page.getByTestId("map-thumbnail-list")).toContainText("Improve Customer Satisfaction");
  });

  test("kpi_owner sees a different, owner-focused composition", async ({ page }) => {
    await loginAs(page, "kpi_owner");
    await page.goto("/overview");

    await expect(page.getByTestId("home-page")).toBeVisible();
    await expect(page.getByTestId("home-role-label")).toHaveText("KPI owner");
    await expect(page.getByTestId("widget-owned-kpis")).toBeVisible();
    await expect(page.getByTestId("widget-due-submissions")).toBeVisible();

    await expect(page.getByTestId("widget-kpi-tiles")).toHaveCount(0);
    await expect(page.getByTestId("widget-scorecard-strip")).toHaveCount(0);
    await expect(page.getByTestId("widget-review-calendar")).toHaveCount(0);
    await expect(page.getByTestId("widget-map-thumbnail")).toHaveCount(0);
  });

  test("the two role compositions are genuinely different widget sets, not just re-labeled", async ({ page }) => {
    await loginAs(page, "executive_viewer");
    await page.goto("/overview");
    const executiveWidgets = await page.getByTestId("home-widgets").locator("[data-testid^='widget-slot-']").evaluateAll(
      (nodes) => nodes.map((n) => n.getAttribute("data-testid"))
    );

    await loginAs(page, "kpi_owner");
    await page.goto("/overview");
    const ownerWidgets = await page.getByTestId("home-widgets").locator("[data-testid^='widget-slot-']").evaluateAll(
      (nodes) => nodes.map((n) => n.getAttribute("data-testid"))
    );

    expect(executiveWidgets.length).toBeGreaterThan(0);
    expect(ownerWidgets.length).toBeGreaterThan(0);
    expect(executiveWidgets).not.toEqual(ownerWidgets);
  });

  test("renders correctly mirrored in Arabic", async ({ page, context }) => {
    await loginAs(page, "executive_viewer");
    await context.addCookies([{ name: "stratalign_locale", value: "ar", url: page.url() }]);
    await page.goto("/overview");

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByTestId("home-page")).toBeVisible();
    await expect(page.getByTestId("widget-scorecard-strip")).toBeVisible();
    await expect(page.getByTestId(`scorecard-strip-item-${fixture.scorecardId}`)).toContainText("بطاقة الأداء المؤسسية");
  });

  test("extended vertical slice: a real governance change propagates live onto both Home and Master Scorecard", async ({ page }) => {
    test.setTimeout(90_000);

    // Analyst proposes a real weighting change against the seeded scorecard.
    await loginAs(page, "member"); // alice — strategy_analyst
    const proposed = await trpcJson(page, "scorecard.weighting.propose", {
      scorecardId: fixture.scorecardId,
      draftWeights: { "84000000-0000-4000-8000-000000000011": 70, "84000000-0000-4000-8000-000000000012": 30 },
      activeFrom: new Date().toISOString(),
      approvalParticipantId: fixture.bobId,
    });
    const caseId: string = proposed.body.result.data.json.id;
    expect(caseId).toMatch(/^[0-9a-f-]{36}$/i);

    // Home still reflects the pre-change score for this session (nothing approved yet).
    await page.goto("/overview");
    await expect(page.getByTestId(`scorecard-strip-score-${fixture.scorecardId}`)).toHaveText("60%");

    // A genuinely different user approves, then publishes.
    await page.context().clearCookies();
    await loginAs(page, "platform_administrator"); // bob
    const decided = await trpcJson(page, "governance.decide", { id: caseId, decision: "approved" });
    expect(decided.status, JSON.stringify(decided.body)).toBe(200);
    const published = await trpcJson(page, "scorecard.weighting.publish", { scorecardId: fixture.scorecardId, approvalCaseId: caseId });
    expect(published.status, JSON.stringify(published.body)).toBe(200);

    // The change is now visibly reflected live on Home...
    await page.goto("/overview");
    await expect(page.getByTestId(`scorecard-strip-score-${fixture.scorecardId}`)).toHaveText("70%");

    // ...and on the same real data source Master Scorecard reads.
    const previewGet = await page.request.get(`/api/trpc/scorecard.weighting.preview?input=${encodeURIComponent(JSON.stringify({
      json: { scorecardId: fixture.scorecardId, draftWeights: { "84000000-0000-4000-8000-000000000011": 70, "84000000-0000-4000-8000-000000000012": 30 } },
    }))}`);
    const previewBody = await previewGet.json();
    expect(Math.round(previewBody.result.data.json.currentScore)).toBe(70);
  });
});
