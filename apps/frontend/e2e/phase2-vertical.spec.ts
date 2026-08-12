import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { expect, test, type Page } from "@playwright/test";

import { loginAs, loginWithCredentials } from "./utils";

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(__dirname, "../../..");

async function setup(mode: "bootstrap", ...args: string[]): Promise<{ aliceId: string; bobId: string; planId: string }>;
async function setup(mode: "prepare-capture", ...args: string[]): Promise<{ kpiDefinitionId: string; kpiVersionId: string; strategyNodeId: string; period: string }>;
async function setup(mode: string, ...args: string[]) {
  const result = await execFileAsync(
    "pnpm",
    ["--filter", "@spm/backend", "exec", "tsx", "prisma/e2e-phase2-vertical-setup.ts", mode, ...args],
    { cwd: workspaceRoot, env: process.env },
  );
  const line = result.stdout.trim().split("\n").at(-1);
  if (!line) throw new Error(`Phase 2 setup produced no output for ${mode}`);
  return JSON.parse(line) as unknown;
}

function caseIdFrom(text: string) {
  const match = text.match(/Case:\s*([0-9a-f-]{36})/i);
  if (!match?.[1]) throw new Error(`Approval case id was not present in: ${text}`);
  return match[1];
}

async function loginAsAlice(page: Page) {
  const email = process.env.E2E_MEMBER_EMAIL;
  const password = process.env.E2E_CREDENTIAL_PASSWORD;
  if (!email || !password) throw new Error("Real E2E credential fixtures are not configured");
  await page.context().clearCookies();
  await loginWithCredentials(page, email, password);
}

test("Phase 2 vertical: strategy to persisted KPI performance commentary", async ({ page }) => {
  test.setTimeout(180_000);
  const fixture = await setup("bootstrap");
  const suffix = `${Date.now()}`;
  const strategyName = `Phase 2 Growth Objective ${suffix}`;
  const kpiName = `Phase 2 Growth KPI ${suffix}`;
  const commentary = `Actual exceeded target in the Phase 2 vertical run ${suffix}.`;

  await loginAs(page, "platform_administrator");

  // Persist a real Strategy objective and prove it survives a document reload.
  await page.goto("/strategy-hierarchy");
  await expect(page.getByLabel("Plan version")).toHaveValue(fixture.planId, { timeout: 20_000 });
  await page.getByPlaceholder("English name").fill(strategyName);
  await page.getByPlaceholder("Arabic name").fill("هدف النمو للمرحلة الثانية");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByTestId("persisted-strategy-node").filter({ hasText: strategyName })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("persisted-strategy-node").filter({ hasText: strategyName })).toBeVisible();

  // Create the KPI in Registry, submit its definition for Governance, and align it to Strategy.
  await loginAsAlice(page);
  await page.goto("/kpis-okrs");
  await page.getByRole("button", { name: "Create KPI" }).click();
  await page.getByLabel("Name (English)").fill(kpiName);
  await page.getByLabel("Name (Arabic)").fill("مؤشر نمو المرحلة الثانية");
  await page.getByLabel("Description (English)").fill("Real persisted KPI used by the final Phase 2 vertical test.");
  await page.getByLabel("Description (Arabic)").fill("مؤشر دائم لاختبار المرحلة الثانية");
  await page.getByLabel("Owner user UUID").fill(fixture.aliceId);
  await page.getByLabel("Different approver user UUID").fill(fixture.bobId);
  await page.getByRole("button", { name: "Save & submit for approval" }).click();
  const kpiNotice = page.getByText(/Draft v1 persisted and submitted for approval/);
  await expect(kpiNotice).toBeVisible();
  const kpiCaseId = caseIdFrom(await kpiNotice.innerText());
  await page.getByLabel(strategyName).check();
  await page.getByRole("button", { name: "Save alignment" }).click();
  await expect(page.getByText("Strategy alignment persisted.")).toBeVisible();
  await page.reload();
  await page.getByTestId("persisted-kpi-row").filter({ hasText: kpiName }).click();
  await expect(page.getByLabel(strategyName)).toBeChecked();

  // Create and backend-preview the canonical threshold rule, then submit it.
  await page.getByRole("button", { name: "Rule Builder" }).click();
  await page.getByLabel("KPI version").selectOption({ label: `${kpiName} · v1` });
  await page.getByRole("button", { name: "Persist draft" }).click();
  await expect(page.getByText(/Draft v1 persisted/)).toBeVisible();
  await page.getByRole("button", { name: "Backend preview" }).click();
  await expect(page.getByTestId("backend-preview-result")).toContainText("At Risk");
  await page.getByPlaceholder("Different approver UUID").fill(fixture.bobId);
  await page.getByRole("button", { name: "Submit" }).click();
  const ruleNotice = page.getByText(/Submitted for approval\. Case:/);
  await expect(ruleNotice).toBeVisible();
  const ruleCaseId = caseIdFrom(await ruleNotice.innerText());
  await page.reload();
  await page.getByRole("button", { name: "Rule Builder" }).click();
  await page.getByLabel("KPI version").selectOption({ label: `${kpiName} · v1` });
  await expect(page.getByText("pending", { exact: true })).toBeVisible();

  // The submitter still cannot approve, including through a direct procedure call.
  const ownDecision = await page.request.post("/api/trpc/governance.decide", {
    data: { json: { id: ruleCaseId, decision: "approved" } },
  });
  expect(ownDecision.status()).toBe(403);

  // Bob, a genuinely different persisted user, approves both pending cases.
  await page.context().clearCookies();
  await loginAs(page, "platform_administrator");
  for (const caseId of [kpiCaseId, ruleCaseId]) {
    await page.goto(`/approvals/${caseId}`);
    await page.getByTestId("approve-case").click();
    await expect(page.getByTestId("decision-badge")).toContainText("Approved");
    await page.reload();
    await expect(page.getByTestId("decision-badge")).toContainText("Approved");
  }

  // Alice publishes the approved KPI, then publishes and binds its approved rule.
  await loginAsAlice(page);
  await page.goto("/kpis-okrs");
  await page.getByTestId("persisted-kpi-row").filter({ hasText: kpiName }).click();
  await page.getByPlaceholder("Approved case UUID").fill(kpiCaseId);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Approved KPI version published.")).toBeVisible();
  await page.getByRole("button", { name: "Rule Builder" }).click();
  await page.getByLabel("KPI version").selectOption({ label: `${kpiName} · v1` });
  await expect(page.getByText("approved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publish & bind" }).click();
  await expect(page.getByText("Published threshold rule bound to the KPI version.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Rule Builder" }).click();
  await page.getByLabel("KPI version").selectOption({ label: `${kpiName} · v1` });
  await expect(page.getByText(/Binding:/).locator(".." )).toContainText("kpi-threshold:");

  // Test-only scheduling/target setup makes the published KPI available in the real capture workspace.
  const captureFixture = await setup("prepare-capture", kpiName, strategyName);
  await page.getByRole("button", { name: "Data Capture" }).click();
  const task = page.getByTestId("persisted-capture-task").filter({ hasText: kpiName });
  await expect(task).toBeVisible();
  await task.click();
  await page.getByRole("button", { name: "Start persisted session" }).click();
  await expect(page.getByText("State:")).toContainText("DRAFT");
  await page.locator('input[type="number"]').fill("105");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("State:")).toContainText("SUBMITTED");
  await page.reload();
  await page.getByRole("button", { name: "Data Capture" }).click();
  await expect(page.getByTestId("persisted-capture-task").filter({ hasText: kpiName })).toContainText("SUBMITTED");

  // The worker consumes the measurement event and persists the real Rules result.
  await expect.poll(async () => {
    const response = await page.request.get(`/api/trpc/capture.detail?input=${encodeURIComponent(JSON.stringify({ json: { kpiDefinitionId: captureFixture.kpiDefinitionId } }))}`);
    if (!response.ok()) return null;
    const body = await response.json();
    return body.result.data.json.statuses.at(-1)?.status ?? null;
  }, { timeout: 30_000 }).toBe("On Track");

  await page.getByRole("button", { name: "KPI Library" }).click();
  const persistedKpi = page.getByTestId("persisted-kpi-row").filter({ hasText: kpiName });
  await persistedKpi.locator("..").getByRole("button", { name: "Open KPI Detail" }).click();
  await expect(page.getByRole("heading", { name: kpiName })).toBeVisible();
  await expect(page.getByText("Actual105 %", { exact: true })).toBeVisible();
  await expect(page.getByText("Trend13 %", { exact: true })).toBeVisible();
  await expect(page.getByText("On Track", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(strategyName)).toBeVisible();

  await page.getByPlaceholder("Add commentary").fill(commentary);
  const commentaryCreated = page.waitForResponse((response) =>
    response.url().includes("/api/trpc/capture.addCommentary") && response.request().method() === "POST" && response.ok(),
  );
  await page.getByRole("button", { name: "Post" }).click();
  await commentaryCreated;
  await expect(page.locator("p").getByText(commentary, { exact: true })).toBeVisible();
  await page.reload();
  await page.getByTestId("persisted-kpi-row").filter({ hasText: kpiName }).locator("..").getByRole("button", { name: "Open KPI Detail" }).click();
  await expect(page.locator("p").getByText(commentary, { exact: true })).toBeVisible();
});
