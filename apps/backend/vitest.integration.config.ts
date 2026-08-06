import { defineConfig } from "vitest/config";

/**
 * Integration and end-to-end suite. Needs a real Postgres and Redis, supplied
 * either through DATABASE_URL/REDIS_URL (CI service containers, or the local
 * docker-compose stack) or started on demand via Testcontainers.
 *
 * These specs run single-threaded: they share one database and one Redis
 * keyspace, and running files in parallel would let one spec's queue drain
 * another's jobs.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/integration/**/*.spec.ts", "test/e2e/**/*.spec.ts"],
    clearMocks: true,
    restoreMocks: true,
    // Container start-up dominates the first file; the tests themselves never
    // wait on wall-clock time.
    testTimeout: 30_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
