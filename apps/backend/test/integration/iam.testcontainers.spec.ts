import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { promisify } from "node:util";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { PLATFORM_ROLES } from "@spm/domain-iam";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/database/prisma.service";
import { IamAdminService } from "../../src/modules/iam/iam-admin.service";
import { IamAuthorizationService } from "../../src/modules/iam/iam-authorization.service";
import type { AuthenticationFreshnessService } from "../../src/modules/iam/authentication-freshness.service";

const execFileAsync = promisify(execFile);

describe.sequential("IAM with real migrations and PostgreSQL Testcontainers", () => {
  let postgres: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let prisma: PrismaService;
  let admin: IamAdminService;
  let authorization: IamAuthorizationService;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer("postgres:17-alpine")
      .withDatabase("spm_iam_test").withUsername("spm_test")
      .withPassword("spm_test_password").start();
    const environment = {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: postgres.getConnectionUri(),
      SEED_TEST_USER_PASSWORD: "TestcontainersSeedPassword123!",
    };
    await execFileAsync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: process.cwd(), env: environment,
    });
    await execFileAsync("pnpm", ["exec", "prisma", "db", "seed"], {
      cwd: process.cwd(), env: environment,
    });
    await execFileAsync("pnpm", ["exec", "prisma", "db", "seed"], {
      cwd: process.cwd(), env: environment,
    });
    prisma = new PrismaService(postgres.getConnectionUri());
    await prisma.connect();
    admin = new IamAdminService(prisma);
    const freshness = {
      resolve: async (value: { authenticatedAt: Date }) => value.authenticatedAt,
    } as AuthenticationFreshnessService;
    authorization = new IamAuthorizationService(prisma, freshness);
  }, 120_000);

  afterAll(async () => {
    await prisma?.disconnect();
    await postgres?.stop();
  }, 60_000);

  it("applies migrations and seeds all platform roles idempotently", async () => {
    const roles = await prisma.role.findMany({ orderBy: { name: "asc" } });
    expect(roles).toHaveLength(PLATFORM_ROLES.length);
    expect(new Set(roles.map((role) => role.name))).toEqual(new Set(PLATFORM_ROLES));
    expect(await prisma.groupRoleMapping.count({
      where: { groupClaim: "stratalign-admins", isCurrent: true },
    })).toBe(1);
  });

  it("creates ScopeGrant idempotently and resolves credentials authorization", async () => {
    const first = await admin.grantScope({
      userEmail: "alice@example.test", roleName: "kpi_owner",
      orgScopeType: "sector", orgScopeId: "north", grantedBy: (await prisma.user.findUniqueOrThrow({
        where: { email: "bob@example.test" },
      })).id,
    });
    const second = await admin.grantScope({
      userEmail: "alice@example.test", roleName: "kpi_owner",
      orgScopeType: "sector", orgScopeId: "north", grantedBy: first.grantedBy,
    });
    expect(second.id).toBe(first.id);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "alice@example.test" } });
    const state = await authorization.resolve({
      user: { id: user.id, email: user.email, name: user.displayName },
      authenticatedAt: new Date(), authenticationMethod: "credentials",
      sessionId: "11111111-1111-4111-8111-111111111111",
      expiresAt: new Date(Date.now() + 900_000),
    });
    expect(state.roles).toContain("kpi_owner");
  });

  it("resolves OIDC authorization from validated stored groups and excludes inactive mappings", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "carol@example.test" } });
    await prisma.oidcIdentity.create({
      data: {
        issuer: "https://issuer.example.test/", subject: "carol-subject", userId: user.id,
        emailAtLink: user.email, emailVerifiedAt: new Date(),
        groups: ["stratalign-admins", "inactive-group"], lastValidatedAt: new Date(),
      },
    });
    const analyst = await prisma.role.findUniqueOrThrow({ where: { name: "strategy_analyst" } });
    const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: "bob@example.test" } });
    await prisma.groupRoleMapping.create({
      data: {
        groupClaim: "inactive-group", roleId: analyst.id, orgScopeType: "FUNCTION",
        orgScopeId: "platform", version: 1, isCurrent: false, createdById: adminUser.id,
      },
    });
    const state = await authorization.resolve({
      user: { id: user.id, email: user.email, name: user.displayName },
      authenticatedAt: new Date(), authenticationMethod: "oidc",
      sessionId: "22222222-2222-4222-8222-222222222222",
      expiresAt: new Date(Date.now() + 900_000),
    });
    expect(state.roles).toContain("platform_administrator");
    expect(state.roles).not.toContain("strategy_analyst");
  });

  it("loads every seeded positive StepUpPolicy", async () => {
    const policies = await prisma.stepUpPolicy.findMany();
    expect(policies).toHaveLength(7);
    expect(policies.every((policy) => policy.requiresStepUp && policy.maxSessionAgeSeconds > 0)).toBe(true);
  });

  it("uses only forward migrations, never db push or accept-data-loss", async () => {
    const migrationsRoot = `${process.cwd()}/prisma/migrations`;
    const directories = await readdir(migrationsRoot);
    const sql = (await Promise.all(directories.map(async (directory) => {
      try { return await readFile(`${migrationsRoot}/${directory}/migration.sql`, "utf8"); }
      catch { return ""; }
    }))).join("\n");
    expect(sql).not.toMatch(/db push|accept-data-loss/i);
  });

  it("wraps the IAM migration transactionally and installs its database constraints", async () => {
    const migration = await readFile(
      `${process.cwd()}/prisma/migrations/20260805150000_add_iam_authorization/migration.sql`,
      "utf8",
    );
    expect(migration.trim()).toMatch(/^BEGIN;[\s\S]*COMMIT;$/);
    const constraints = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT conname AS name
      FROM pg_constraint
      WHERE connamespace = 'iam'::regnamespace
        AND conname IN (
          'group_role_mappings_version_check',
          'group_role_mappings_group_claim_version_key',
          'scope_grants_user_role_scope_key',
          'step_up_policies_max_age_check'
        )
    `;
    expect(new Set(constraints.map(({ name }) => name))).toEqual(new Set([
      "group_role_mappings_version_check",
      "group_role_mappings_group_claim_version_key",
      "scope_grants_user_role_scope_key",
      "step_up_policies_max_age_check",
    ]));
    const indexes = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT indexname AS name FROM pg_indexes
      WHERE schemaname = 'iam'
        AND indexname = 'group_role_mappings_one_current_per_group'
    `;
    expect(indexes).toEqual([{ name: "group_role_mappings_one_current_per_group" }]);
  });
});
