import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/auth-global-setup.ts",
  webServer: [
    {
      command: "pnpm --filter @spm/backend start",
      cwd: "../..",
      url: "http://localhost:4000/trpc/health.check",
      reuseExistingServer: true,
      timeout: 60_000,
      stdout: "ignore",
      stderr: "ignore",
    },
    {
      command: "pnpm --filter @spm/frontend dev",
      cwd: "../..",
      url: "http://localhost:3000/login",
      reuseExistingServer: true,
      timeout: 60_000,
      stdout: "ignore",
      stderr: "ignore",
    },
  ],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  // The dev server is started and reset separately (in-memory mock state
  // needs a clean process per run) — Playwright just points at it directly.
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
