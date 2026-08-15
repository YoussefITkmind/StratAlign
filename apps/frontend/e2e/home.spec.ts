import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "./utils";

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(__dirname, "../../..");
const backendTrpc = process.env.NEXT_PUBLIC_TRPC_URL ?? "http://localhost:4000/trpc";

interface Fixture {
  scorecardId: string;
  bobId: string;
}

async function runJsonFixture(script: string): Promise<Record<string, string>> {
  const result = await execFileAsync(
    "pnpm",
    ["--filter", "@spm/backend", "exec", "tsx", script],
    { cwd: workspaceRoot, env: process.env },
  );
  const line = result.stdout.trim().split("\n").at(-1);
  if (!line) throw new Error(`${script} produced no output`);
  return JSON.parse(line) as Record<string, string>;
}

async function seedFixture(): Promise<Fixture> {
  const scorecard = await runJsonFixture("prisma/e2e-scorecard-seed.ts");
  await runJsonFixture("prisma/e2e-home-seed.ts");
  const users = await runJsonFixture("prisma/e2e-governance-users.ts");
  if (!scorecard.scorecardId || !users.bobId) throw new Error("Home fixture is incomplete");
  return { scorecardId: scorecard.scorecardId, bobId: users.bobId };
}

async function backendMutation(page: Page, procedure: string, input: unknown) {
  const response = await page.request.post(`${backendTrpc}/${procedure}`, { data: input });
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(200);
  return body;
}

function trpcData<T>(body: any): T {
  const data = body?.result?.data;
  return (data?.json ?? data) as T;
}

test.describe("Home landing checkpoint — real Phase 2/3 data", () => {
  test.describe.configure({ mode: "serial" });
  let fixture: Fixture;

  test.beforeAll(async () => {
    fixture = await seedFixture();
  });

  test("executive viewer sees the executive composition populated from real APIs", async ({ page }) => {
    await loginAs(page, "executive_viewer");
    await page.goto("/overview");

    await expect(page.getByTestId("home-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("home-role-label")).toContainText("executive viewer");
    await expect(page.getByTestId("widget-kpi-tiles")).toContainText("E2E Revenue Growth");
    await expect(page.getByTestId("widget-exceptions")).toContainText("E2E Customer Satisfaction");
    await expect(page.getByTestId(`scorecard-strip-item-${fixture.scorecardId}`)).toBeVisible();
    await expect(page.getByTestId("widget-map-thumbnail")).toContainText("Grow Revenue");
    await expect(page.getByTestId("widget-map-thumbnail")).toContainText("Improve Customer Satisfaction");

    await expect(page.getByTestId("widget-owned-kpis")).toHaveCount(0);
    await expect(page.getByTestId("widget-due-submissions")).toHaveCount(0);
  });

  test("KPI owner sees a different composition with a real owned KPI and real capture cadence", async ({ page }) => {
    await loginAs(page, "kpi_owner");
    await page.goto("/overview");

    await expect(page.getByTestId("home-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("home-role-label")).toContainText("kpi owner");
    await expect(page.getByTestId("widget-owned-kpis")).toContainText("E2E Home Owner KPI");
    await expect(page.getByTestId("widget-due-submissions")).toContainText("E2E Home Owner KPI");
    await expect(page.locator('[data-testid^="due-submission-"]').first()).toBeVisible();

    await expect(page.getByTestId("widget-kpi-tiles")).toHaveCount(0);
    await expect(page.getByTestId("widget-scorecard-strip")).toHaveCount(0);
    await expect(page.getByTestId("widget-map-thumbnail")).toHaveCount(0);
  });

  test("Home mirrors under RTL", async ({ page, context }) => {
    await loginAs(page, "executive_viewer");
    await context.addCookies([{ name: "stratalign_locale", value: "ar", url: page.url() }]);
    await page.goto("/overview");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByTestId("home-widgets")).toBeVisible();
    await expect(page.getByTestId("widget-scorecard-strip")).toBeVisible();
  });

  test("approved weighting change is reflected live on Home and Master Scorecard", async ({ page }) => {
    test.setTimeout(90_000);

    await page.context().clearCookies();
    await loginAs(page, "member");
    const proposed = await backendMutation(page, "scorecard.weighting.propose", {
      scorecardId: fixture.scorecardId,
      draftWeights: {
        "84000000-0000-4000-8000-000000000011": 70,
        "84000000-0000-4000-8000-000000000012": 30,
      },
      activeFrom: new Date().toISOString(),
      approvalParticipantId: fixture.bobId,
    });
    const caseId = trpcData<{ id: string }>(proposed).id;

    await page.context().clearCookies();
    await loginAs(page, "platform_administrator");
    await page.goto("/governance");
    const card = page.locator(`[data-testid="approval-card"][data-case-id="${caseId}"]`);
    await expect(card).toBeVisible();
    await expect(card.getByTestId("scorecard-weighting-diff")).toContainText("70");
    await card.getByTestId("decision-rationale").fill("Home checkpoint approval");
    await card.getByTestId("approve-case").click();
    await expect(card).toHaveCount(0);

    await page.context().clearCookies();
    await loginAs(page, "member");
    await backendMutation(page, "scorecard.weighting.publish", {
      scorecardId: fixture.scorecardId,
      approvalCaseId: caseId,
    });

    await page.context().clearCookies();
    await loginAs(page, "executive_viewer");
    await page.goto("/overview");
    await expect(page.getByTestId(`scorecard-strip-score-${fixture.scorecardId}`)).toHaveText("70%", { timeout: 15_000 });

    await page.goto(`/balanced-scorecards/${fixture.scorecardId}`);
    await expect(page.getByTestId("overall-score")).toHaveText("70%", { timeout: 15_000 });
    await expect(page.getByTestId("perspective-weight-84000000-0000-4000-8000-000000000011")).toContainText("70");
    await expect(page.getByTestId("perspective-weight-84000000-0000-4000-8000-000000000012")).toContainText("30");
  });
});
