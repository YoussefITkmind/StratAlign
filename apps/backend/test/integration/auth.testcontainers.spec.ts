import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer } from "@testcontainers/redis";
import { appRouter } from "@spm/api";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PrismaService } from "../../src/database/prisma.service";
import { CredentialService } from "../../src/modules/auth/credential.service";
import { LoginRateLimiterService } from "../../src/modules/auth/login-rate-limiter.service";
import { hashPassword } from "../../src/modules/auth/password.service";
import { RedisService } from "../../src/redis/redis.service";

const execFileAsync = promisify(execFile);

describe.sequential("authentication with PostgreSQL and Redis Testcontainers", () => {
  let postgres: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let redis: Awaited<ReturnType<RedisContainer["start"]>>;
  let prisma: PrismaService;
  let redisService: RedisService;
  let credentials: CredentialService;
  let limiter: LoginRateLimiterService;

  const email = "testcontainers-user@example.test";
  const password = "TestcontainersPassword123!";

  beforeAll(async () => {
    [postgres, redis] = await Promise.all([
      new PostgreSqlContainer("postgres:17-alpine")
        .withDatabase("spm_test")
        .withUsername("spm_test")
        .withPassword("spm_test_password")
        .start(),
      new RedisContainer("redis:7-alpine").start(),
    ]);

    await execFileAsync(
      "pnpm",
      ["exec", "prisma", "migrate", "deploy"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: postgres.getConnectionUri(),
        },
      },
    );

    prisma = new PrismaService(postgres.getConnectionUri());
    redisService = new RedisService(redis.getConnectionUrl());
    await Promise.all([prisma.connect(), redisService.connect()]);

    const user = await prisma.user.create({
      data: { email, displayName: "Testcontainers User" },
    });
    await prisma.localCredential.create({
      data: {
        userId: user.id,
        email,
        passwordHash: await hashPassword(password),
      },
    });

    credentials = await CredentialService.create(prisma);
    limiter = new LoginRateLimiterService(redisService.getClient());
  }, 120_000);

  afterAll(async () => {
    await Promise.allSettled([
      prisma?.disconnect(),
      redisService?.disconnect(),
    ]);
    await Promise.allSettled([
      postgres?.stop(),
      redis?.stop(),
    ]);
  }, 60_000);

  function caller(clientIp: string) {
    return appRouter.createCaller({
      health: { check: vi.fn() },
      credentials,
      loginRateLimiter: limiter,
      clientIp,
      session: null,
      oidcIdentities: { reconcile: vi.fn() },
      auditTap: { recordCompletedCall: vi.fn().mockResolvedValue(undefined) },
      authenticationFreshness: { record: vi.fn() },
      authorization: { resolve: vi.fn() },
      iam: {
        listRoles: vi.fn(), listGroupMappings: vi.fn(), upsertGroupMapping: vi.fn(),
        grantScope: vi.fn(), listCredentialUsers: vi.fn(), listScopeGrants: vi.fn(),
        getStepUpPolicy: vi.fn(),
      },
    });
  }

  it("authenticates a seeded Argon2id credential", async () => {
    await expect(caller("10.0.0.1").auth.login({ email, password }))
      .resolves.toMatchObject({ email, displayName: "Testcontainers User" });
  });

  it("returns the same safe response for a wrong password and nonexistent user", async () => {
    const errors: unknown[] = [];
    for (const attempt of [
      { email, password: "WrongPassword123!" },
      { email: "missing@example.test", password: "WrongPassword123!" },
    ]) {
      try {
        await caller(`10.0.0.${errors.length + 2}`).auth.login(attempt);
      } catch (error) {
        errors.push(error);
      }
    }

    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatchObject({
      code: "UNAUTHORIZED",
      message: "Invalid email or password",
    });
    expect(errors[1]).toMatchObject({
      code: "UNAUTHORIZED",
      message: "Invalid email or password",
    });
  });

  it("exercises the unknown-user dummy-hash path", async () => {
    await expect(
      credentials.authenticate("definitely-missing@example.test", password),
    ).resolves.toBeNull();
  });

  it("blocks credential attempts after the configured Redis limit", async () => {
    const rateLimitedCaller = caller("10.0.0.99");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(rateLimitedCaller.auth.login({
        email: "rate-limited@example.test",
        password: "WrongPassword123!",
      })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }

    await expect(rateLimitedCaller.auth.login({
      email: "rate-limited@example.test",
      password: "WrongPassword123!",
    })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });
});
