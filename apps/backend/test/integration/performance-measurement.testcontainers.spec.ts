import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaService } from "../../src/database/prisma.service";
import { EventBusService } from "../../src/events/event-bus.service";
import type { QueueService } from "../../src/queue/queue.service";
import { createLogger } from "../../src/logging/logger";

import { MeasurementService } from "../../src/modules/performance/measurement.service";
import { CaptureSessionService } from "../../src/modules/performance/capture-session.service";
import { CommentaryService } from "../../src/modules/performance/commentary.service";
import { TargetSeriesService } from "../../src/modules/performance/target-series.service";
import { PERFORMANCE_EVENT_TYPES } from "../../src/modules/performance/performance.events";

/**
 * Runs the committed migrations. The Prisma CLI is invoked through its
 * JavaScript entry point with the current Node binary, matching
 * `support/test-services.ts`: spawning the `pnpm`/`prisma` shim instead would
 * mean spawning a `.cmd` on Windows, which Node refuses without a shell.
 */
function applyMigrations(databaseUrl: string): void {
  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve("prisma/build/index.js");

  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}

/** The event bus only needs a queue for its best-effort relay nudge. */
const noopQueueService = {
  enqueue: async () => undefined,
} as unknown as QueueService;

const KPI = "kpi-version-alpha";
const KPI_DEFINITION = "kpi-alpha";

const BETA_KPI = "kpi-version-beta";
const BETA_KPI_DEFINITION = "kpi-beta";

const SCOPE = "50000000-0000-4000-8000-000000000001";
const OTHER_SCOPE = "50000000-0000-4000-8000-000000000002";
const UNKNOWN_SCOPE = "50000000-0000-4000-8000-000000000099";

const BASELINE_PLAN = "60000000-0000-4000-8000-000000000001";
const REVISION_PLAN = "60000000-0000-4000-8000-000000000002";

const PERIOD = "2026-Q1";

/**
 * A login role that is a member of `spm_app`, which is exactly the deployment
 * shape the module README prescribes: the application never connects as the
 * table owner, because an owner bypasses table privileges and would make the
 * immutability guarantee vacuous.
 */
const APP_LOGIN_ROLE = "spm_app_login";
const APP_LOGIN_PASSWORD = "spm_app_login_password";

function asApplicationRole(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.username = APP_LOGIN_ROLE;
  url.password = APP_LOGIN_PASSWORD;
  return url.toString();
}

describe.sequential(
  "performance measurements with real migrations and PostgreSQL Testcontainers",
  () => {
    let postgres: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
    let databaseUrl: string;
    let prisma: PrismaService;
    /** A second client connected as the unprivileged application role. */
    let applicationPrisma: PrismaService;
    let measurements: MeasurementService;
    let captureSessions: CaptureSessionService;
    let commentary: CommentaryService;
    let targets: TargetSeriesService;
    let ownerId: string;
    let stewardId: string;

    beforeAll(async () => {
      postgres = await new PostgreSqlContainer("postgres:17-alpine")
        .withDatabase("spm_performance_test")
        .withUsername("spm_test")
        .withPassword("spm_test_password")
        .start();

      databaseUrl = postgres.getConnectionUri();

      applyMigrations(databaseUrl);

      prisma = new PrismaService(databaseUrl);
      await prisma.connect();

      // Give the application its own login role, a member of spm_app, so the
      // suite can exercise Prisma with production's privilege set rather than
      // the migration owner's.
      await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_roles WHERE rolname = '${APP_LOGIN_ROLE}'
          ) THEN
            CREATE ROLE "${APP_LOGIN_ROLE}"
              LOGIN PASSWORD '${APP_LOGIN_PASSWORD}'
              IN ROLE "spm_app";
          END IF;
        END
        $$;
      `);

      applicationPrisma = new PrismaService(
        asApplicationRole(databaseUrl),
      );
      await applicationPrisma.connect();

      const logger = createLogger("error");
      const eventBus = new EventBusService(
        noopQueueService,
        logger.child("event-bus"),
      );

      measurements = new MeasurementService(
        prisma,
        eventBus,
        logger.child("measurement"),
      );
      captureSessions = new CaptureSessionService(
        prisma,
        measurements,
        logger.child("capture"),
      );
      commentary = new CommentaryService(prisma);
      targets = new TargetSeriesService(prisma);
    }, 180_000);

    afterAll(async () => {
      await applicationPrisma?.disconnect();
      await prisma?.disconnect();
      await postgres?.stop();
    }, 60_000);

    beforeEach(async () => {
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE
           "performance"."capture_sessions",
           "performance"."commentary",
           "performance"."target_series",
           "performance"."measurements",
           "registry"."kpi_hierarchy_nodes",
           "registry"."kpi_definitions",
           "registry"."kpi_versions",
           "strategy"."strategy_nodes",
           "strategy"."plan_versions",
           "public"."domain_events",
           "iam"."users"
         RESTART IDENTITY CASCADE`,
      );

      const [owner, steward] = await Promise.all([
        prisma.user.create({
          data: { email: "kpi-owner@example.test", displayName: "KPI Owner" },
        }),
        prisma.user.create({
          data: { email: "steward@example.test", displayName: "Steward" },
        }),
      ]);

      ownerId = owner.id;
      stewardId = steward.id;

      // Real Strategy fixtures required by Performance foreign keys.
      await prisma.planVersion.createMany({
        data: [
          {
            id: BASELINE_PLAN,
            name: "Performance baseline plan",
          },
          {
            id: REVISION_PLAN,
            name: "Performance revised plan",
          },
        ],
      });

      await prisma.strategyNode.createMany({
        data: [
          {
            id: SCOPE,
            type: "OBJECTIVE",
            nameEn: "North performance scope",
            nameAr: "نطاق الأداء الشمالي",
            planVersionId: BASELINE_PLAN,
            createdBy: ownerId,
          },
          {
            id: OTHER_SCOPE,
            type: "OBJECTIVE",
            nameEn: "South performance scope",
            nameAr: "نطاق الأداء الجنوبي",
            planVersionId: BASELINE_PLAN,
            createdBy: ownerId,
          },
        ],
      });

      // Real Registry fixture required by kpi_version_id foreign keys.
      await prisma.kpiDefinition.createMany({
        data: [
          { id: KPI_DEFINITION },
          { id: BETA_KPI_DEFINITION },
        ],
      });

      await prisma.kpiVersion.createMany({
        data: [
          {
            id: KPI,
            kpiDefinitionId: KPI_DEFINITION,
            version: 1,
            nameEn: "Performance test KPI",
            nameAr: "مؤشر اختبار الأداء",
            unit: "%",
            polarity: "HIGHER_IS_BETTER",
            frequency: "QUARTERLY",
            dataSourceType: "MANUAL",
            ownerUserId: ownerId,
            activeFrom: new Date("2026-01-01T00:00:00.000Z"),
          },
          {
            id: BETA_KPI,
            kpiDefinitionId: BETA_KPI_DEFINITION,
            version: 1,
            nameEn: "Performance beta KPI",
            nameAr: "مؤشر الأداء التجريبي",
            unit: "%",
            polarity: "HIGHER_IS_BETTER",
            frequency: "QUARTERLY",
            dataSourceType: "MANUAL",
            ownerUserId: ownerId,
            activeFrom: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
      });
    });

    // -----------------------------------------------------------------------
    // Test group 1 — database-level immutability
    // -----------------------------------------------------------------------

    describe("PostgreSQL-level immutability", () => {
      it(
        "rejects UPDATE and DELETE on measurements for the application role",
        async () => {
          const measurement = await measurements.record({
            kpiVersionId: KPI,
            scopeNodeId: SCOPE,
            period: PERIOD,
            value: 100,
            source: "MANUAL",
            submittedBy: ownerId,
          });

          const client = new Client({ connectionString: databaseUrl });
          await client.connect();

          try {
            // Everything below runs with the privileges the application has in
            // production, not the migration owner's.
            await client.query('SET ROLE "spm_app"');

            const { rows } = await client.query<{ current_user: string }>(
              "SELECT current_user",
            );
            expect(rows[0]?.current_user).toBe("spm_app");

            await expect(
              client.query(
                "UPDATE performance.measurements SET value = 999 WHERE id = $1",
                [measurement.id],
              ),
            ).rejects.toMatchObject({ code: "42501" });

            await expect(
              client.query(
                "DELETE FROM performance.measurements WHERE id = $1",
                [measurement.id],
              ),
            ).rejects.toMatchObject({ code: "42501" });

            // The privileges the application does need are intact: a
            // correction is an INSERT.
            await expect(
              client.query(
                `INSERT INTO performance.measurements
                   (id, kpi_version_id, scope_node_id, period, value, source, submitted_by, supersedes_id)
                 VALUES (gen_random_uuid()::text, $1, $2, $3, 110, 'manual', $4, $5)`,
                [KPI, SCOPE, PERIOD, ownerId, measurement.id],
              ),
            ).resolves.toBeDefined();

            const survivors = await client.query<{ count: string }>(
              "SELECT count(*)::text AS count FROM performance.measurements",
            );
            expect(survivors.rows[0]?.count).toBe("2");
          } finally {
            await client.end();
          }
        },
        60_000,
      );

      it(
        "confirms the application role is genuinely unprivileged",
        async () => {
          // Without this the whole immutability suite could pass vacuously: a
          // superuser or the table's owner bypasses table privileges, so
          // "permission denied" would never be reachable in the first place.
          const [role] = await prisma.$queryRawUnsafe<
            Array<{
              rolsuper: boolean;
              rolbypassrls: boolean;
              is_table_owner: boolean;
            }>
          >(`
            SELECT
              r.rolsuper,
              r.rolbypassrls,
              (c.relowner = r.oid) AS is_table_owner
            FROM pg_roles r
            JOIN pg_class c ON c.relname = 'measurements'
            JOIN pg_namespace n
              ON n.oid = c.relnamespace AND n.nspname = 'performance'
            WHERE r.rolname = 'spm_app'
          `);

          expect(role).toBeDefined();
          expect(role?.rolsuper).toBe(false);
          expect(role?.rolbypassrls).toBe(false);
          expect(role?.is_table_owner).toBe(false);

          // And the privilege set is exactly SELECT + INSERT.
          const [grants] = await prisma.$queryRawUnsafe<
            Array<{
              can_select: boolean;
              can_insert: boolean;
              can_update: boolean;
              can_delete: boolean;
            }>
          >(`
            SELECT
              has_table_privilege('spm_app', 'performance.measurements', 'SELECT') AS can_select,
              has_table_privilege('spm_app', 'performance.measurements', 'INSERT') AS can_insert,
              has_table_privilege('spm_app', 'performance.measurements', 'UPDATE') AS can_update,
              has_table_privilege('spm_app', 'performance.measurements', 'DELETE') AS can_delete
          `);

          expect(grants).toMatchObject({
            can_select: true,
            can_insert: true,
            can_update: false,
            can_delete: false,
          });
        },
      );

      it(
        "blocks Prisma itself when it runs as the application role",
        async () => {
          // The service layer refuses to update; this proves the database
          // refuses too, through the ORM the application actually uses. A
          // future service bug, a raw Prisma call, or a new mutation path
          // cannot get past it.
          const measurement = await measurements.record({
            kpiVersionId: KPI,
            scopeNodeId: SCOPE,
            period: PERIOD,
            value: 100,
            source: "MANUAL",
            submittedBy: ownerId,
          });

          await expect(
            applicationPrisma.measurement.update({
              where: { id: measurement.id },
              data: { value: 999 },
            }),
          ).rejects.toThrow();

          await expect(
            applicationPrisma.measurement.updateMany({
              data: { locked: false },
            }),
          ).rejects.toThrow();

          await expect(
            applicationPrisma.measurement.delete({
              where: { id: measurement.id },
            }),
          ).rejects.toThrow();

          await expect(
            applicationPrisma.measurement.deleteMany({}),
          ).rejects.toThrow();

          const stored = await prisma.measurement.findUniqueOrThrow({
            where: { id: measurement.id },
          });
          expect(Number(stored.value.toString())).toBe(100);
          expect(await prisma.measurement.count()).toBe(1);
        },
      );

      it(
        "still lets the application role read and append through Prisma",
        async () => {
          const first = await measurements.record({
            kpiVersionId: KPI,
            scopeNodeId: SCOPE,
            period: PERIOD,
            value: 100,
            source: "MANUAL",
            submittedBy: ownerId,
          });

          const correction = await applicationPrisma.measurement.create({
            data: {
              kpiVersionId: KPI,
              scopeNodeId: SCOPE,
              period: PERIOD,
              value: 110,
              source: "MANUAL",
              submittedById: ownerId,
              supersedesId: first.id,
            },
          });

          expect(correction.supersedesId).toBe(first.id);

          const visible = await applicationPrisma.measurement.findMany();
          expect(visible).toHaveLength(2);
        },
      );

      it("leaves the original value untouched after a rejected UPDATE", async () => {
        const measurement = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 42,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        const client = new Client({ connectionString: databaseUrl });
        await client.connect();

        try {
          await client.query('SET ROLE "spm_app"');
          await client
            .query("UPDATE performance.measurements SET value = 0")
            .catch(() => undefined);
        } finally {
          await client.end();
        }

        const stored = await prisma.measurement.findUniqueOrThrow({
          where: { id: measurement.id },
        });

        expect(Number(stored.value.toString())).toBe(42);
      });
    });

    // -----------------------------------------------------------------------
    // Database constraints and bypass paths
    // -----------------------------------------------------------------------

    describe("database constraints", () => {
      it(
        "blocks a forked correction chain at the unique index, not just in the service",
        async () => {
          const first = await measurements.record({
            kpiVersionId: KPI,
            scopeNodeId: SCOPE,
            period: PERIOD,
            value: 100,
            source: "MANUAL",
            submittedBy: ownerId,
          });

          const insertCorrection = (value: number) =>
            applicationPrisma.measurement.create({
              data: {
                kpiVersionId: KPI,
                scopeNodeId: SCOPE,
                period: PERIOD,
                value,
                source: "MANUAL",
                submittedById: ownerId,
                supersedesId: first.id,
              },
            });

          await insertCorrection(110);

          // Bypassing the service entirely still cannot fork the chain.
          await expect(insertCorrection(120)).rejects.toMatchObject({
            code: "P2002",
          });

          expect(await prisma.measurement.count()).toBe(2);
        },
      );

      it("rejects a measurement whose submitter does not exist", async () => {
        await expect(
          applicationPrisma.measurement.create({
            data: {
              kpiVersionId: KPI,
              scopeNodeId: SCOPE,
              period: PERIOD,
              value: 100,
              source: "MANUAL",
              submittedById: "00000000-0000-4000-8000-000000000000",
            },
          }),
        ).rejects.toMatchObject({ code: "P2003" });

        expect(await prisma.measurement.count()).toBe(0);
      });

      it("rejects a supersedes reference to a measurement that does not exist", async () => {
        await expect(
          applicationPrisma.measurement.create({
            data: {
              kpiVersionId: KPI,
              scopeNodeId: SCOPE,
              period: PERIOD,
              value: 100,
              source: "MANUAL",
              submittedById: ownerId,
              supersedesId: "00000000-0000-4000-8000-000000000000",
            },
          }),
        ).rejects.toMatchObject({ code: "P2003" });
      });

      it("rejects an invalid measurement source at the database level", async () => {
        await expect(
          prisma.$executeRawUnsafe(
            `INSERT INTO performance.measurements
               (id, kpi_version_id, scope_node_id, period, value, source, submitted_by)
             VALUES (gen_random_uuid()::text, $1, $2, $3, 100, 'satellite', $4)`,
            KPI,
            SCOPE,
            PERIOD,
            ownerId,
          ),
        ).rejects.toThrow();

        expect(await prisma.measurement.count()).toBe(0);
      });

      it("rejects commentary from an author that does not exist", async () => {
        await expect(
          prisma.commentary.create({
            data: {
              kpiVersionId: KPI,
              scopeNodeId: SCOPE,
              period: PERIOD,
              authorId: "00000000-0000-4000-8000-000000000000",
              bodyEn: "orphan",
            },
          }),
        ).rejects.toMatchObject({ code: "P2003" });
      });

      it("rejects a duplicate target for the same plan version", async () => {
        const row = {
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          targetValue: 100,
          planVersionId: BASELINE_PLAN,
        };

        await prisma.targetSeries.create({ data: row });

        await expect(
          prisma.targetSeries.create({ data: row }),
        ).rejects.toMatchObject({ code: "P2002" });
      });

      it("refuses to delete a measurement that another row supersedes", async () => {
        const first = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 100,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 110,
          source: "MANUAL",
          supersedesId: first.id,
          submittedBy: ownerId,
        });

        // Even the owner, which bypasses table privileges, cannot break a
        // chain: the foreign key is ON DELETE RESTRICT.
        await expect(
          prisma.measurement.delete({ where: { id: first.id } }),
        ).rejects.toThrow();

        expect(await prisma.measurement.count()).toBe(2);
      });
    });

    // -----------------------------------------------------------------------
    // Test group 2 — supersession chain
    // -----------------------------------------------------------------------

    describe("supersession", () => {
      it("builds an append-only M1 -> M2 -> M3 chain", async () => {
        const first = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 100,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        const second = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 110,
          source: "MANUAL",
          supersedesId: first.id,
          submittedBy: ownerId,
        });

        const third = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 105,
          source: "MANUAL",
          supersedesId: second.id,
          submittedBy: ownerId,
        });

        expect(second.supersedesId).toBe(first.id);
        expect(third.supersedesId).toBe(second.id);

        const current = await measurements.resolveCurrent({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
        });
        expect(current?.id).toBe(third.id);
        expect(current?.value).toBe(105);

        // Every original row is still present and unmodified.
        const all = await prisma.measurement.findMany({
          orderBy: { createdAt: "asc" },
        });
        expect(all).toHaveLength(3);
        expect(all.map((row) => Number(row.value.toString()))).toEqual([
          100, 110, 105,
        ]);

        const chain = await measurements.chainFor(second.id);
        expect(chain.map((entry) => entry.id)).toEqual([
          first.id,
          second.id,
          third.id,
        ]);
      });

      it("rejects a second correction of the same measurement", async () => {
        const first = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 100,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 110,
          source: "MANUAL",
          supersedesId: first.id,
          submittedBy: ownerId,
        });

        await expect(
          measurements.record({
            kpiVersionId: KPI,
            scopeNodeId: SCOPE,
            period: PERIOD,
            value: 120,
            source: "MANUAL",
            supersedesId: first.id,
            submittedBy: ownerId,
          }),
        ).rejects.toMatchObject({ code: "INVALID_SUPERSESSION" });

        expect(await prisma.measurement.count()).toBe(2);
      });

      it("rejects supersession across periods and unknown targets", async () => {
        const q1 = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 100,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        await expect(
          measurements.record({
            kpiVersionId: KPI,
            scopeNodeId: SCOPE,
            period: "2026-Q2",
            value: 90,
            source: "MANUAL",
            supersedesId: q1.id,
            submittedBy: ownerId,
          }),
        ).rejects.toMatchObject({ code: "INVALID_SUPERSESSION" });

        await expect(
          measurements.record({
            kpiVersionId: KPI,
            scopeNodeId: SCOPE,
            period: "2026-Q3",
            value: 90,
            source: "MANUAL",
            supersedesId: "00000000-0000-4000-8000-000000000000",
            submittedBy: ownerId,
          }),
        ).rejects.toMatchObject({ code: "MEASUREMENT_NOT_FOUND" });

        expect(await prisma.measurement.count()).toBe(1);
      });

      it("requires a correction rather than a silent second first value", async () => {
        await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 100,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        await expect(
          measurements.record({
            kpiVersionId: KPI,
            scopeNodeId: SCOPE,
            period: PERIOD,
            value: 110,
            source: "MANUAL",
            submittedBy: ownerId,
          }),
        ).rejects.toMatchObject({ code: "INVALID_SUPERSESSION" });
      });

      it("keeps corrections to different KPIs entirely independent", async () => {
        const alpha = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 100,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        const beta = await measurements.record({
          kpiVersionId: BETA_KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 200,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        const alphaCorrection = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 150,
          source: "MANUAL",
          supersedesId: alpha.id,
          submittedBy: ownerId,
        });

        // Beta's chain is untouched by alpha's correction.
        expect(
          (
            await measurements.resolveCurrent({
              kpiVersionId: BETA_KPI,
              scopeNodeId: SCOPE,
              period: PERIOD,
            })
          )?.id,
        ).toBe(beta.id);

        expect(
          (
            await measurements.resolveCurrent({
              kpiVersionId: KPI,
              scopeNodeId: SCOPE,
              period: PERIOD,
            })
          )?.id,
        ).toBe(alphaCorrection.id);

        expect(await measurements.chainFor(beta.id)).toHaveLength(1);
        expect(await measurements.chainFor(alpha.id)).toHaveLength(2);
      });

      it("refuses to supersede a measurement belonging to another KPI", async () => {
        const alpha = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 100,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        await expect(
          measurements.record({
            kpiVersionId: BETA_KPI,
            scopeNodeId: SCOPE,
            period: PERIOD,
            value: 150,
            source: "MANUAL",
            supersedesId: alpha.id,
            submittedBy: ownerId,
          }),
        ).rejects.toMatchObject({ code: "INVALID_SUPERSESSION" });
      });

      it("refuses to supersede a measurement belonging to another scope", async () => {
        const north = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 100,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        await expect(
          measurements.record({
            kpiVersionId: KPI,
            scopeNodeId: OTHER_SCOPE,
            period: PERIOD,
            value: 150,
            source: "MANUAL",
            supersedesId: north.id,
            submittedBy: ownerId,
          }),
        ).rejects.toMatchObject({ code: "INVALID_SUPERSESSION" });
      });

      it("emits performance.measurement.recorded for every appended row", async () => {
        const first = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 100,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 110,
          source: "MANUAL",
          supersedesId: first.id,
          submittedBy: ownerId,
        });

        const events = await prisma.domainEvent.findMany({
          where: {
            eventType: PERFORMANCE_EVENT_TYPES.measurementRecorded,
          },
        });

        expect(events).toHaveLength(2);
      });

      it("carries the full KPI coordinates on the recorded event", async () => {
        const first = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 250,
          source: "FEED",
          locked: true,
          submittedBy: stewardId,
        });

        const event = await prisma.domainEvent.findFirstOrThrow({
          where: {
            eventType: PERFORMANCE_EVENT_TYPES.measurementRecorded,
          },
        });

        // A consumer must be able to recompute from the payload alone.
        expect(event.payload).toMatchObject({
          measurementId: first.id,
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          source: "FEED",
          locked: true,
          supersedesId: null,
        });

        expect(event.aggregateType).toBe("performance_measurement");
        expect(event.aggregateId).toBe(first.id);
        expect(event.status).toBe("PENDING");
        expect(event.dedupeKey).toContain(first.id);

        const correction = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 260,
          source: "FEED",
          supersedesId: first.id,
          submittedBy: stewardId,
        });

        const correctionEvent = await prisma.domainEvent.findFirstOrThrow({
          where: { aggregateId: correction.id },
        });

        expect(correctionEvent.payload).toMatchObject({
          supersedesId: first.id,
        });
      });

      it("gives each recorded event a distinct dedupe key", async () => {
        const first = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 100,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 110,
          source: "MANUAL",
          supersedesId: first.id,
          submittedBy: ownerId,
        });

        const events = await prisma.domainEvent.findMany({
          where: {
            eventType: PERFORMANCE_EVENT_TYPES.measurementRecorded,
          },
        });

        expect(
          new Set(events.map((event) => event.dedupeKey)).size,
        ).toBe(2);
      });
    });

    // -----------------------------------------------------------------------
    // Test group 3 — point-in-time asOf resolution
    // -----------------------------------------------------------------------

    describe("asOf resolution", () => {
      it("resolves the measurement effective at each point in time", async () => {
        const first = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 100,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        const second = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 110,
          source: "MANUAL",
          supersedesId: first.id,
          submittedBy: ownerId,
        });

        const third = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 105,
          source: "MANUAL",
          supersedesId: second.id,
          submittedBy: ownerId,
        });

        const t1 = first.createdAt;
        const t2 = second.createdAt;
        const t3 = third.createdAt;

        const at = (moment: Date) =>
          measurements.resolveAsOf({
            kpiVersionId: KPI,
            scopeNodeId: SCOPE,
            period: PERIOD,
            asOf: moment,
          });

        const between = (from: Date, to: Date) =>
          new Date((from.getTime() + to.getTime()) / 2);

        // asOf < T1 -> nothing existed yet
        expect(await at(new Date(t1.getTime() - 1_000))).toBeNull();

        // T1 <= asOf < T2 -> M1
        expect((await at(t1))?.id).toBe(first.id);
        expect((await at(between(t1, t2)))?.id).toBe(first.id);

        // T2 <= asOf < T3 -> M2
        expect((await at(t2))?.id).toBe(second.id);
        expect((await at(between(t2, t3)))?.id).toBe(second.id);

        // asOf >= T3 -> M3
        expect((await at(t3))?.id).toBe(third.id);
        expect((await at(new Date(t3.getTime() + 60_000)))?.id).toBe(
          third.id,
        );
      });

      it("keeps independent KPI/scope/period chains separate", async () => {
        const alpha = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 10,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        const otherScope = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: OTHER_SCOPE,
          period: PERIOD,
          value: 20,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        const otherPeriod = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: "2026-Q2",
          value: 30,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        const alphaCorrection = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 11,
          source: "MANUAL",
          supersedesId: alpha.id,
          submittedBy: ownerId,
        });

        const effective = await measurements.list({ limit: 50 });

        expect(effective.map((row) => row.id).sort()).toEqual(
          [alphaCorrection.id, otherScope.id, otherPeriod.id].sort(),
        );

        // Correcting one chain does not disturb the others at any point in time.
        const beforeCorrection = await measurements.list({
          asOf: new Date(alphaCorrection.createdAt.getTime() - 1),
          limit: 50,
        });

        expect(beforeCorrection.map((row) => row.id).sort()).toEqual(
          [alpha.id, otherScope.id, otherPeriod.id].sort(),
        );
      });

      it("reconstructs each scope's history independently at the same instant", async () => {
        const north = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 10,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        const south = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: OTHER_SCOPE,
          period: PERIOD,
          value: 20,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        // Only the northern scope is corrected.
        const northCorrection = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 11,
          source: "MANUAL",
          supersedesId: north.id,
          submittedBy: ownerId,
        });

        const beforeCorrection = new Date(
          northCorrection.createdAt.getTime() - 1,
        );

        const northAt = (asOf: Date) =>
          measurements.resolveAsOf({
            kpiVersionId: KPI,
            scopeNodeId: SCOPE,
            period: PERIOD,
            asOf,
          });

        const southAt = (asOf: Date) =>
          measurements.resolveAsOf({
            kpiVersionId: KPI,
            scopeNodeId: OTHER_SCOPE,
            period: PERIOD,
            asOf,
          });

        expect((await northAt(beforeCorrection))?.id).toBe(north.id);
        expect((await northAt(northCorrection.createdAt))?.id).toBe(
          northCorrection.id,
        );

        // The southern scope reads the same at both instants.
        expect((await southAt(beforeCorrection))?.id).toBe(south.id);
        expect((await southAt(northCorrection.createdAt))?.id).toBe(
          south.id,
        );
      });

      it("reconstructs each period's history independently", async () => {
        const q1 = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: "2026-Q1",
          value: 10,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        const q2 = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: "2026-Q2",
          value: 20,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        const q2Correction = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: "2026-Q2",
          value: 22,
          source: "MANUAL",
          supersedesId: q2.id,
          submittedBy: ownerId,
        });

        const beforeCorrection = new Date(
          q2Correction.createdAt.getTime() - 1,
        );

        expect(
          (
            await measurements.resolveAsOf({
              kpiVersionId: KPI,
              scopeNodeId: SCOPE,
              period: "2026-Q1",
              asOf: beforeCorrection,
            })
          )?.id,
        ).toBe(q1.id);

        expect(
          (
            await measurements.resolveAsOf({
              kpiVersionId: KPI,
              scopeNodeId: SCOPE,
              period: "2026-Q2",
              asOf: beforeCorrection,
            })
          )?.id,
        ).toBe(q2.id);

        expect(
          (
            await measurements.resolveAsOf({
              kpiVersionId: KPI,
              scopeNodeId: SCOPE,
              period: "2026-Q2",
              asOf: q2Correction.createdAt,
            })
          )?.id,
        ).toBe(q2Correction.id);
      });

      it("never returns a superseded row as the current value", async () => {
        const first = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 100,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        const second = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 120,
          source: "MANUAL",
          supersedesId: first.id,
          submittedBy: ownerId,
        });

        const third = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 110,
          source: "MANUAL",
          supersedesId: second.id,
          submittedBy: ownerId,
        });

        const current = await measurements.list({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          limit: 50,
        });

        expect(current).toHaveLength(1);
        expect(current[0]?.id).toBe(third.id);
        expect(current[0]?.value).toBe(110);

        const currentIds = current.map((row) => row.id);
        expect(currentIds).not.toContain(first.id);
        expect(currentIds).not.toContain(second.id);

        // The superseded rows are still stored, unchanged.
        expect(
          Number(
            (
              await prisma.measurement.findUniqueOrThrow({
                where: { id: first.id },
              })
            ).value.toString(),
          ),
        ).toBe(100);
        expect(
          Number(
            (
              await prisma.measurement.findUniqueOrThrow({
                where: { id: second.id },
              })
            ).value.toString(),
          ),
        ).toBe(120);
      });

      it("returns an empty list when nothing matches", async () => {
        await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 10,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        await expect(
          measurements.list({
            kpiVersionId: "kpi-version-unknown",
            limit: 50,
          }),
        ).resolves.toEqual([]);

        await expect(
          measurements.list({ period: "2099-Q4", limit: 50 }),
        ).resolves.toEqual([]);

        await expect(
          measurements.list({ scopeNodeId: UNKNOWN_SCOPE, limit: 50 }),
        ).resolves.toEqual([]);
      });

      it("filters by KPI, scope and period", async () => {
        await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 10,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        await measurements.record({
          kpiVersionId: BETA_KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 20,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        const filtered = await measurements.list({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          limit: 50,
        });

        expect(filtered).toHaveLength(1);
        expect(filtered[0]?.value).toBe(10);
      });
    });

    // -----------------------------------------------------------------------
    // Test group 7 — feed lock
    // -----------------------------------------------------------------------

    describe("feed lock", () => {
      it("rejects manual correction of a locked feed measurement", async () => {
        const feed = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 250,
          source: "FEED",
          locked: true,
          submittedBy: stewardId,
        });

        await expect(
          measurements.record({
            kpiVersionId: KPI,
            scopeNodeId: SCOPE,
            period: PERIOD,
            value: 300,
            source: "MANUAL",
            supersedesId: feed.id,
            submittedBy: ownerId,
          }),
        ).rejects.toMatchObject({ code: "FEED_MEASUREMENT_LOCKED" });

        // Nothing was appended and the feed value is still effective.
        expect(await prisma.measurement.count()).toBe(1);

        const current = await measurements.resolveCurrent({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
        });
        expect(current?.id).toBe(feed.id);
        expect(current?.value).toBe(250);
      });

      it("allows manual correction of an unlocked feed measurement", async () => {
        const feed = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 250,
          source: "FEED",
          locked: false,
          submittedBy: stewardId,
        });

        const corrected = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 300,
          source: "MANUAL",
          supersedesId: feed.id,
          submittedBy: ownerId,
        });

        expect(corrected.supersedesId).toBe(feed.id);

        const current = await measurements.resolveCurrent({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
        });
        expect(current?.id).toBe(corrected.id);
      });

      it("rejects manual correction of a locked manual measurement", async () => {
        const locked = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 10,
          source: "MANUAL",
          locked: true,
          submittedBy: ownerId,
        });

        await expect(
          measurements.record({
            kpiVersionId: KPI,
            scopeNodeId: SCOPE,
            period: PERIOD,
            value: 20,
            source: "MANUAL",
            supersedesId: locked.id,
            submittedBy: ownerId,
          }),
        ).rejects.toMatchObject({ code: "MEASUREMENT_LOCKED" });
      });

      it("rejects a template correction of a locked feed measurement", async () => {
        // `template` is the third capture source; the lock must not be
        // escapable by simply declaring a different non-feed source.
        const feed = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 250,
          source: "FEED",
          locked: true,
          submittedBy: stewardId,
        });

        await expect(
          measurements.record({
            kpiVersionId: KPI,
            scopeNodeId: SCOPE,
            period: PERIOD,
            value: 300,
            source: "TEMPLATE",
            supersedesId: feed.id,
            submittedBy: ownerId,
          }),
        ).rejects.toMatchObject({ code: "FEED_MEASUREMENT_LOCKED" });

        expect(await prisma.measurement.count()).toBe(1);
      });

      it("blocks the capture-session path as well as direct correction", async () => {
        const feed = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 250,
          source: "FEED",
          locked: true,
          submittedBy: stewardId,
        });

        const draft = await captureSessions.startSession({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          ownerId,
        });

        await expect(
          captureSessions.submit({
            sessionId: draft.id,
            actorId: ownerId,
            value: 300,
          }),
        ).rejects.toMatchObject({ code: "FEED_MEASUREMENT_LOCKED" });

        // The lock holds and the feed value is untouched on both paths.
        expect(await prisma.measurement.count()).toBe(1);
        expect(
          Number(
            (
              await prisma.measurement.findUniqueOrThrow({
                where: { id: feed.id },
              })
            ).value.toString(),
          ),
        ).toBe(250);
      });

      it("cannot be escaped by clearing the locked flag", async () => {
        const feed = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 250,
          source: "FEED",
          locked: true,
          submittedBy: stewardId,
        });

        // Unlocking would require an UPDATE, which the application role does
        // not hold — so the lock cannot be lifted from inside the application.
        await expect(
          applicationPrisma.measurement.update({
            where: { id: feed.id },
            data: { locked: false },
          }),
        ).rejects.toThrow();

        expect(
          (
            await prisma.measurement.findUniqueOrThrow({
              where: { id: feed.id },
            })
          ).locked,
        ).toBe(true);

        await expect(
          measurements.record({
            kpiVersionId: KPI,
            scopeNodeId: SCOPE,
            period: PERIOD,
            value: 300,
            source: "MANUAL",
            supersedesId: feed.id,
            submittedBy: ownerId,
          }),
        ).rejects.toMatchObject({ code: "FEED_MEASUREMENT_LOCKED" });
      });

      it("lets a feed supersede a locked feed measurement", async () => {
        const locked = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 10,
          source: "FEED",
          locked: true,
          submittedBy: stewardId,
        });

        const replacement = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 12,
          source: "FEED",
          locked: true,
          supersedesId: locked.id,
          submittedBy: stewardId,
        });

        expect(replacement.supersedesId).toBe(locked.id);
      });
    });

    // -----------------------------------------------------------------------
    // Test group 6 — capture lifecycle
    // -----------------------------------------------------------------------

    describe("capture session lifecycle", () => {
      const start = () =>
        captureSessions.startSession({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          ownerId,
        });

      it("moves draft -> submitted -> recalled -> draft", async () => {
        const draft = await start();
        expect(draft.state).toBe("DRAFT");

        const submitted = await captureSessions.submit({
          sessionId: draft.id,
          actorId: ownerId,
          value: 90,
        });
        expect(submitted.session.state).toBe("SUBMITTED");
        expect(submitted.measurement.value).toBe(90);
        expect(submitted.session.submittedMeasurementId).toBe(
          submitted.measurement.id,
        );

        const recalled = await captureSessions.recall({
          sessionId: draft.id,
          actorId: ownerId,
          actorIsDataSteward: false,
        });
        expect(recalled.state).toBe("RECALLED");

        const reopened = await start();
        expect(reopened.id).toBe(draft.id);
        expect(reopened.state).toBe("DRAFT");

        // The correction supersedes the originally submitted measurement
        // rather than modifying it.
        const resubmitted = await captureSessions.submit({
          sessionId: draft.id,
          actorId: ownerId,
          value: 95,
        });

        expect(resubmitted.measurement.supersedesId).toBe(
          submitted.measurement.id,
        );
        expect(await prisma.measurement.count()).toBe(2);
      });

      it("opens the draft against the right KPI, scope, period and owner", async () => {
        const draft = await start();

        expect(draft).toMatchObject({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          ownerId,
          state: "DRAFT",
          submittedMeasurementId: null,
          submittedAt: null,
          recalledAt: null,
          consumedAt: null,
        });
        expect(draft.createdAt).toBeInstanceOf(Date);

        // Persisted, not just returned.
        const stored = await prisma.captureSession.findUniqueOrThrow({
          where: { id: draft.id },
        });
        expect(stored).toMatchObject({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          ownerId,
          state: "DRAFT",
        });
      });

      it("stamps submittedAt and the measurement id on submit", async () => {
        const draft = await start();
        const submitted = await captureSessions.submit({
          sessionId: draft.id,
          actorId: ownerId,
          value: 90,
        });

        expect(submitted.session.submittedAt).toBeInstanceOf(Date);
        expect(submitted.session.submittedMeasurementId).toBe(
          submitted.measurement.id,
        );
        expect(submitted.measurement.source).toBe("MANUAL");
        expect(submitted.measurement.submittedBy).toBe(ownerId);
        expect(submitted.measurement.kpiVersionId).toBe(KPI);
        expect(submitted.measurement.scopeNodeId).toBe(SCOPE);
        expect(submitted.measurement.period).toBe(PERIOD);
      });

      it("stamps recalledAt and keeps the submitted measurement id", async () => {
        const draft = await start();
        const submitted = await captureSessions.submit({
          sessionId: draft.id,
          actorId: ownerId,
          value: 90,
        });

        const recalled = await captureSessions.recall({
          sessionId: draft.id,
          actorId: ownerId,
          actorIsDataSteward: false,
        });

        expect(recalled.recalledAt).toBeInstanceOf(Date);
        // The measurement survives the recall untouched.
        expect(recalled.submittedMeasurementId).toBe(
          submitted.measurement.id,
        );
        expect(await prisma.measurement.count()).toBe(1);
      });

      it("rejects a repeated recall of the same session", async () => {
        const draft = await start();
        await captureSessions.submit({
          sessionId: draft.id,
          actorId: ownerId,
          value: 90,
        });
        await captureSessions.recall({
          sessionId: draft.id,
          actorId: ownerId,
          actorIsDataSteward: false,
        });

        await expect(
          captureSessions.recall({
            sessionId: draft.id,
            actorId: ownerId,
            actorIsDataSteward: false,
          }),
        ).rejects.toMatchObject({ code: "INVALID_CAPTURE_TRANSITION" });
      });

      it("reports an unknown session rather than failing obscurely", async () => {
        const unknown = "00000000-0000-4000-8000-000000000000";

        await expect(
          captureSessions.submit({
            sessionId: unknown,
            actorId: ownerId,
            value: 1,
          }),
        ).rejects.toMatchObject({ code: "CAPTURE_SESSION_NOT_FOUND" });

        await expect(
          captureSessions.recall({
            sessionId: unknown,
            actorId: ownerId,
            actorIsDataSteward: true,
          }),
        ).rejects.toMatchObject({ code: "CAPTURE_SESSION_NOT_FOUND" });
      });

      it("keeps sessions for different periods independent", async () => {
        const q1 = await start();
        await captureSessions.submit({
          sessionId: q1.id,
          actorId: ownerId,
          value: 90,
        });

        // A submitted Q1 does not block Q2.
        const q2 = await captureSessions.startSession({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: "2026-Q2",
          ownerId,
        });

        expect(q2.id).not.toBe(q1.id);
        expect(q2.state).toBe("DRAFT");

        const submitted = await captureSessions.submit({
          sessionId: q2.id,
          actorId: ownerId,
          value: 70,
        });

        // Q2's first value is not treated as a correction of Q1.
        expect(submitted.measurement.supersedesId).toBeNull();
        expect(await prisma.measurement.count()).toBe(2);
      });

      it("rejects submitted -> submitted", async () => {
        const draft = await start();
        await captureSessions.submit({
          sessionId: draft.id,
          actorId: ownerId,
          value: 90,
        });

        await expect(
          captureSessions.submit({
            sessionId: draft.id,
            actorId: ownerId,
            value: 91,
          }),
        ).rejects.toMatchObject({ code: "INVALID_CAPTURE_TRANSITION" });
      });

      it("rejects draft -> recalled", async () => {
        const draft = await start();

        await expect(
          captureSessions.recall({
            sessionId: draft.id,
            actorId: ownerId,
            actorIsDataSteward: false,
          }),
        ).rejects.toMatchObject({ code: "INVALID_CAPTURE_TRANSITION" });
      });

      it("rejects recalled -> submitted without reopening", async () => {
        const draft = await start();
        await captureSessions.submit({
          sessionId: draft.id,
          actorId: ownerId,
          value: 90,
        });
        await captureSessions.recall({
          sessionId: draft.id,
          actorId: ownerId,
          actorIsDataSteward: false,
        });

        await expect(
          captureSessions.submit({
            sessionId: draft.id,
            actorId: ownerId,
            value: 95,
          }),
        ).rejects.toMatchObject({ code: "INVALID_CAPTURE_TRANSITION" });
      });

      it("rejects a duplicate active session", async () => {
        await start();

        await expect(start()).rejects.toMatchObject({
          code: "DUPLICATE_ACTIVE_SESSION",
        });
      });

      it("locks the period against a new session once submitted", async () => {
        const draft = await start();
        await captureSessions.submit({
          sessionId: draft.id,
          actorId: ownerId,
          value: 90,
        });

        await expect(start()).rejects.toMatchObject({
          code: "DUPLICATE_ACTIVE_SESSION",
        });
      });

      it("refuses recall once the deadline has passed", async () => {
        const draft = await captureSessions.startSession({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          ownerId,
          recallDeadlineAt: new Date(Date.now() - 1_000),
        });

        await captureSessions.submit({
          sessionId: draft.id,
          actorId: ownerId,
          value: 90,
        });

        await expect(
          captureSessions.recall({
            sessionId: draft.id,
            actorId: ownerId,
            actorIsDataSteward: false,
          }),
        ).rejects.toMatchObject({ code: "RECALL_CUTOFF_REACHED" });
      });

      it("refuses recall once the submission has been consumed", async () => {
        const draft = await start();
        await captureSessions.submit({
          sessionId: draft.id,
          actorId: ownerId,
          value: 90,
        });
        await captureSessions.markConsumed(draft.id);

        await expect(
          captureSessions.recall({
            sessionId: draft.id,
            actorId: ownerId,
            actorIsDataSteward: false,
          }),
        ).rejects.toMatchObject({ code: "RECALL_CUTOFF_REACHED" });
      });

      it("allows recall before the cutoff and lets a data steward recall", async () => {
        const draft = await captureSessions.startSession({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          ownerId,
          recallDeadlineAt: new Date(Date.now() + 3_600_000),
        });

        await captureSessions.submit({
          sessionId: draft.id,
          actorId: ownerId,
          value: 90,
        });

        const recalled = await captureSessions.recall({
          sessionId: draft.id,
          actorId: stewardId,
          actorIsDataSteward: true,
        });

        expect(recalled.state).toBe("RECALLED");
      });

      it("refuses recall by an unrelated user", async () => {
        const draft = await start();
        await captureSessions.submit({
          sessionId: draft.id,
          actorId: ownerId,
          value: 90,
        });

        await expect(
          captureSessions.recall({
            sessionId: draft.id,
            actorId: stewardId,
            actorIsDataSteward: false,
          }),
        ).rejects.toMatchObject({ code: "RECALL_NOT_PERMITTED" });
      });

      it("leaves the session in draft when submission is rejected", async () => {
        await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 250,
          source: "FEED",
          locked: true,
          submittedBy: stewardId,
        });

        const draft = await start();

        await expect(
          captureSessions.submit({
            sessionId: draft.id,
            actorId: ownerId,
            value: 300,
          }),
        ).rejects.toMatchObject({ code: "FEED_MEASUREMENT_LOCKED" });

        expect((await captureSessions.get(draft.id)).state).toBe("DRAFT");
        expect(await prisma.measurement.count()).toBe(1);
      });
    });

    // -----------------------------------------------------------------------
    // Test group 8 — bilingual commentary
    // -----------------------------------------------------------------------

    describe("commentary", () => {
      const base = {
        kpiVersionId: KPI,
        scopeNodeId: SCOPE,
        period: PERIOD,
      };

      it("persists English-only commentary", async () => {
        const created = await commentary.add({
          ...base,
          authorId: ownerId,
          bodyEn: "Delivery recovered in March.",
        });

        expect(created).toMatchObject({
          ...base,
          authorId: ownerId,
          bodyEn: "Delivery recovered in March.",
          bodyAr: null,
        });
      });

      it("persists Arabic-only commentary", async () => {
        const created = await commentary.add({
          ...base,
          authorId: ownerId,
          bodyAr: "تحسن الأداء في مارس.",
        });

        expect(created.bodyAr).toBe("تحسن الأداء في مارس.");
        expect(created.bodyEn).toBeNull();
      });

      it("persists both languages together", async () => {
        const created = await commentary.add({
          ...base,
          authorId: stewardId,
          bodyEn: "Delivery recovered in March.",
          bodyAr: "تحسن الأداء في مارس.",
        });

        const stored = await prisma.commentary.findUniqueOrThrow({
          where: { id: created.id },
        });

        expect(stored.bodyEn).toBe("Delivery recovered in March.");
        expect(stored.bodyAr).toBe("تحسن الأداء في مارس.");
        expect(stored.authorId).toBe(stewardId);
        expect(stored.kpiVersionId).toBe(KPI);
        expect(stored.scopeNodeId).toBe(SCOPE);
        expect(stored.period).toBe(PERIOD);
      });

      it("rejects commentary with no content in either language", async () => {
        await expect(
          commentary.add({
            ...base,
            authorId: ownerId,
            bodyEn: "   ",
            bodyAr: "",
          }),
        ).rejects.toMatchObject({ code: "COMMENTARY_CONTENT_REQUIRED" });

        expect(await prisma.commentary.count()).toBe(0);
      });

      it("stamps createdAt and does not disturb measurements", async () => {
        const measurement = await measurements.record({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          value: 100,
          source: "MANUAL",
          submittedBy: ownerId,
        });

        const before = Date.now();
        const created = await commentary.add({
          ...base,
          authorId: ownerId,
          bodyEn: "Context for this period.",
        });

        expect(created.createdAt).toBeInstanceOf(Date);
        expect(created.createdAt.getTime()).toBeGreaterThanOrEqual(
          before - 1_000,
        );

        // Commentary is narrative, not data: the measurement is untouched.
        const stored = await prisma.measurement.findUniqueOrThrow({
          where: { id: measurement.id },
        });
        expect(Number(stored.value.toString())).toBe(100);
        expect(await prisma.measurement.count()).toBe(1);
      });

      it("keeps commentary for different periods and scopes apart", async () => {
        await commentary.add({
          ...base,
          authorId: ownerId,
          bodyEn: "q1 north",
        });
        await commentary.add({
          ...base,
          period: "2026-Q2",
          authorId: ownerId,
          bodyEn: "q2 north",
        });
        await commentary.add({
          ...base,
          scopeNodeId: OTHER_SCOPE,
          authorId: ownerId,
          bodyEn: "q1 south",
        });

        const q1North = await commentary.list({ ...base, limit: 10 });

        expect(q1North).toHaveLength(1);
        expect(q1North[0]?.bodyEn).toBe("q1 north");
      });

      it("allows several comments on the same KPI, scope and period", async () => {
        const first = await commentary.add({
          ...base,
          authorId: ownerId,
          bodyEn: "initial read",
        });
        const second = await commentary.add({
          ...base,
          authorId: stewardId,
          bodyAr: "مراجعة",
        });

        expect(first.id).not.toBe(second.id);
        expect(await prisma.commentary.count()).toBe(2);
      });

      it("lists commentary newest first", async () => {
        await commentary.add({ ...base, authorId: ownerId, bodyEn: "first" });
        await commentary.add({ ...base, authorId: ownerId, bodyEn: "second" });

        const listed = await commentary.list({ ...base, limit: 10 });

        expect(listed.map((entry) => entry.bodyEn)).toEqual([
          "second",
          "first",
        ]);
      });
    });

    // -----------------------------------------------------------------------
    // Target series
    // -----------------------------------------------------------------------

    describe("target series", () => {
      it("keeps plan and revised targets side by side", async () => {
        const baseline = await targets.setTarget({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,

          planVersionId: BASELINE_PLAN,
          targetValue: 100,
        });

        const revised = await targets.setTarget({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,
          targetValue: 85,
          planVersionId: REVISION_PLAN,
        });

        expect(baseline.planVersionId).toBe(BASELINE_PLAN);
        expect(revised.planVersionId).toBe(REVISION_PLAN);

        expect(
          (
            await targets.getTarget({
              kpiVersionId: KPI,
              scopeNodeId: SCOPE,
              period: PERIOD,

              planVersionId: BASELINE_PLAN,
            })
          )?.targetValue,
        ).toBe(100);

        expect(
          (
            await targets.getTarget({
              kpiVersionId: KPI,
              scopeNodeId: SCOPE,
              period: PERIOD,
              planVersionId: REVISION_PLAN,
            })
          )?.targetValue,
        ).toBe(85);
      });

      it("overwrites a target within the same plan version", async () => {
        await targets.setTarget({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,

          planVersionId: BASELINE_PLAN,
          targetValue: 100,
        });

        await targets.setTarget({
          kpiVersionId: KPI,
          scopeNodeId: SCOPE,
          period: PERIOD,

          planVersionId: BASELINE_PLAN,
          targetValue: 120,
        });

        expect(await prisma.targetSeries.count()).toBe(1);
      });
    });
  },
);
