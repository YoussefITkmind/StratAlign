import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";

export interface TestServiceUrls {
  databaseUrl: string;
  redisUrl: string;
}

let started: {
  urls: TestServiceUrls;
  postgres?: StartedPostgreSqlContainer;
  redis?: StartedRedisContainer;
} | null = null;

/**
 * Provides a real Postgres and Redis for integration tests.
 *
 * Local development may reuse explicitly configured DATABASE_URL and REDIS_URL.
 * CI always starts isolated Testcontainers so repository-level environment
 * variables cannot accidentally point integration tests at unavailable
 * localhost services.
 *
 * Containers are started once per process and shared; the integration Vitest
 * config runs single-forked for exactly this reason.
 */
export async function startTestServices(): Promise<TestServiceUrls> {
  if (started) {
    return started.urls;
  }

  const existingDatabaseUrl = process.env.DATABASE_URL;
  const existingRedisUrl = process.env.REDIS_URL;

  const isCi = process.env.CI === "true";

if (!isCi && existingDatabaseUrl && existingRedisUrl) {
    started = {
      urls: { databaseUrl: existingDatabaseUrl, redisUrl: existingRedisUrl },
    };

    applyMigrations(existingDatabaseUrl);

    return started.urls;
  }

  const postgres = await new PostgreSqlContainer("postgres:17-alpine")
    .withDatabase("spm_platform")
    .withUsername("spm")
    .withPassword("spm_test_password")
    .start();

  const redis = await new RedisContainer("redis:7-alpine").start();

  const urls: TestServiceUrls = {
    databaseUrl: postgres.getConnectionUri(),
    redisUrl: redis.getConnectionUrl(),
  };

  applyMigrations(urls.databaseUrl);

  started = { urls, postgres, redis };

  return urls;
}

export async function stopTestServices(): Promise<void> {
  if (!started) {
    return;
  }

  await started.postgres?.stop();
  await started.redis?.stop();

  started = null;
}

/** The backend package root, which is where prisma.config.ts lives. */
const BACKEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Runs the committed migrations rather than pushing the schema, so the suite
 * exercises the same SQL that CI and production apply.
 *
 * The Prisma CLI is invoked through its JavaScript entry point with the
 * current Node binary. Spawning the `prisma` shim instead would mean spawning
 * a `.cmd` on Windows, which Node refuses without a shell.
 */
function applyMigrations(databaseUrl: string): void {
  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve("prisma/build/index.js");

  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: BACKEND_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}

/**
 * A unique queue prefix per test file keeps BullMQ keyspaces from colliding
 * when several specs share one Redis instance, so a spec can never drain
 * another spec's jobs.
 */
export function uniqueQueuePrefix(label: string): string {
  return `test-${label}-${randomUUID().slice(0, 8)}`;
}
