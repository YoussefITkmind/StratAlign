import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaService } from "../../src/database/prisma.service";
import {
  RulesOperationError,
  RulesService,
} from "../../src/modules/rules/rules.service";

const execFileAsync = promisify(execFile);

describe.sequential(
  "rules with real migrations and PostgreSQL Testcontainers",
  () => {
    let postgres: Awaited<
      ReturnType<PostgreSqlContainer["start"]>
    >;
    let prisma: PrismaService;
    let rules: RulesService;
    let createdBy: string;

    beforeAll(async () => {
      postgres = await new PostgreSqlContainer(
        "postgres:17-alpine",
      )
        .withDatabase("spm_rules_test")
        .withUsername("spm_test")
        .withPassword("spm_test_password")
        .start();

      await execFileAsync(
        "pnpm",
        [
          "exec",
          "prisma",
          "migrate",
          "deploy",
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            NODE_ENV: "test",
            DATABASE_URL:
              postgres.getConnectionUri(),
          },
        },
      );

      prisma = new PrismaService(
        postgres.getConnectionUri(),
      );
      await prisma.connect();

      const user = await prisma.user.create({
        data: {
          email: "rules-author@example.test",
          displayName: "Rules Author",
        },
      });

      createdBy = user.id;
      rules = new RulesService(prisma);
    }, 120_000);

    afterAll(async () => {
      await prisma?.disconnect();
      await postgres?.stop();
    }, 60_000);

    it(
      "creates, publishes, evaluates and supersedes rule versions",
      async () => {
        const firstDraft = await rules.createDraft({
          ruleKey: "delivery-performance",
          name: "Delivery Performance",
          createdBy,
          document: {
            ruleType: "threshold_status",
            direction: "higher_is_better",
            bands: [
              {
                label: "on_track",
                color: "green",
                comparator: "gte",
                value: 80,
              },
              {
                label: "at_risk",
                color: "amber",
                comparator: "gte",
                value: 60,
              },
            ],
          },
        });

        expect(firstDraft).toMatchObject({
          ruleKey: "delivery-performance",
          version: 1,
          status: "draft",
          isCurrent: true,
          supersedesId: null,
        });

        await expect(
          rules.evaluate(firstDraft.id, {
            value: 90,
          }),
        ).rejects.toBeInstanceOf(
          RulesOperationError,
        );

        const firstPublished =
          await rules.publish(firstDraft.id);

        expect(firstPublished).toMatchObject({
          version: 1,
          status: "published",
          isCurrent: true,
        });
        expect(
          firstPublished.publishedAt,
        ).toBeInstanceOf(Date);

        await expect(
          rules.evaluate(firstPublished.id, {
            value: 85,
          }),
        ).resolves.toMatchObject({
          label: "on_track",
          color: "green",
        });

        const secondDraft =
          await rules.createDraft({
            ruleKey: "delivery-performance",
            name: "Delivery Performance",
            createdBy,
            document: {
              ruleType: "threshold_status",
              direction: "higher_is_better",
              bands: [
                {
                  label: "on_track",
                  color: "green",
                  comparator: "gte",
                  value: 90,
                },
                {
                  label: "at_risk",
                  color: "amber",
                  comparator: "gte",
                  value: 70,
                },
              ],
            },
          });

        expect(secondDraft).toMatchObject({
          version: 2,
          status: "draft",
          isCurrent: true,
          supersedesId: firstPublished.id,
        });

        const activeWhileDraftExists =
          await rules.getPublished(
            "delivery-performance",
          );

        expect(activeWhileDraftExists?.id).toBe(
          firstPublished.id,
        );

        await expect(
          rules.evaluate(firstPublished.id, {
            value: 85,
          }),
        ).resolves.toMatchObject({
          label: "on_track",
          color: "green",
        });

        const secondPublished =
          await rules.publish(secondDraft.id);

        expect(secondPublished).toMatchObject({
          version: 2,
          status: "published",
          isCurrent: true,
          supersedesId: firstPublished.id,
        });

        const storedFirstVersion =
          await rules.getVersion(
            "delivery-performance",
            1,
          );

        expect(storedFirstVersion).toMatchObject({
          id: firstPublished.id,
          version: 1,
          status: "superseded",
          isCurrent: false,
        });

        await expect(
          rules.evaluate(secondPublished.id, {
            value: 85,
          }),
        ).resolves.toMatchObject({
          label: "at_risk",
          color: "amber",
        });

        await expect(
          rules.evaluate(firstPublished.id, {
            value: 85,
          }),
        ).rejects.toBeInstanceOf(
          RulesOperationError,
        );

        const listed = await rules.list();

        expect(listed).toHaveLength(1);
        expect(listed[0]).toMatchObject({
          id: secondPublished.id,
          version: 2,
          status: "published",
          isCurrent: true,
        });
      },
    );

    it(
      "prevents creating two current drafts",
      async () => {
        const firstDraft = await rules.createDraft({
          ruleKey: "duplicate-draft-test",
          name: "Duplicate Draft Test",
          createdBy,
          document: {
            ruleType: "rollup",
            method: "sum",
          },
        });

        expect(firstDraft.status).toBe("draft");

        await expect(
          rules.createDraft({
            ruleKey: "duplicate-draft-test",
            name: "Duplicate Draft Test",
            createdBy,
            document: {
              ruleType: "rollup",
              method: "average",
            },
          }),
        ).rejects.toMatchObject({
          code: "RULES_OPERATION_FAILED",
        });
      },
    );

    it(
      "rejects evaluation input for the wrong rule type",
      async () => {
        const draft = await rules.createDraft({
          ruleKey: "validated-input-test",
          name: "Validated Input Test",
          createdBy,
          document: {
            ruleType: "rollup",
            method: "sum",
          },
        });

        const published =
          await rules.publish(draft.id);

        await expect(
          rules.evaluate(published.id, {
            value: 50,
          }),
        ).rejects.toThrow();
      },
    );
  },
);
