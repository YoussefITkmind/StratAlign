import { defineConfig } from "vitest/config";

/**
 * Unit suite. Pure and hand-mocked only — no database, no Redis, no Docker, so
 * `pnpm test` stays fast and runnable anywhere.
 *
 * Integration and end-to-end specs live under `test/integration` and
 * `test/e2e` and are run by `vitest.integration.config.ts`.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/unit/**/*.spec.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
