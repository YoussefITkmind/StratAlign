import {
  execFile,
} from "node:child_process";

import {
  resolve,
} from "node:path";

import {
  promisify,
} from "node:util";

import {
  test,
  expect,
} from "@playwright/test";

import {
  loginAs,
} from "./utils";

const execFileAsync =
  promisify(execFile);

const workspaceRoot =
  resolve(
    __dirname,
    "../../..",
  );

const APPROVER_CASE_ID =
  "70000000-0000-4000-8000-000000000001";

const OWN_CASE_ID =
  "70000000-0000-4000-8000-000000000002";

async function resetGovernanceFixtures() {
  await execFileAsync(
    "pnpm",
    [
      "--filter",
      "@spm/backend",
      "exec",
      "tsx",
      "prisma/e2e-governance-seed.ts",
    ],
    {
      cwd:
        workspaceRoot,

      env:
        process.env,
    },
  );
}

test.describe(
  "Governance approvals — real backend",
  () => {
    test.beforeEach(
      async () => {
        await resetGovernanceFixtures();
      },
    );

    test(
      "lists only real approvals assigned to the authenticated approver",
      async ({
        page,
      }) => {
        await loginAs(
          page,
          "platform_administrator",
        );

        await page.goto(
          "/approvals",
        );

        const list =
          page.getByTestId(
            "approvals-list",
          );

        /*
         * Alice's case is assigned to Bob,
         * therefore Bob sees it.
         */
        await expect(
          list.getByText(
            "GroupRoleMapping",
          ),
        ).toBeVisible();

        /*
         * Bob submitted the RoleGrant
         * himself, so the real backend
         * myPendingApprovals query must
         * exclude it.
         */
        await expect(
          list.getByText(
            "RoleGrant",
          ),
        ).toHaveCount(
          0,
        );
      },
    );

    test(
      "shows the persisted before/after diff and approves through real Governance",
      async ({
        page,
      }) => {
        await loginAs(
          page,
          "platform_administrator",
        );

        await page.goto(
          `/approvals/${APPROVER_CASE_ID}`,
        );

        await expect(
          page.getByRole(
            "cell",
            {
              name:
                "stratalign-analysts",
            },
          ).first(),
        ).toBeVisible();

        await expect(
          page.getByRole(
            "cell",
            {
              name:
                "member",
            },
          ),
        ).toBeVisible();

        await expect(
          page.getByRole(
            "cell",
            {
              name:
                "platform_administrator",
            },
          ),
        ).toBeVisible();

        await page
          .getByTestId(
            "approve-case",
          )
          .click();

        await expect(
          page.getByTestId(
            "decision-badge",
          ),
        ).toContainText(
          "Approved",
        );

        /*
         * Reload proves this is persisted
         * PostgreSQL state, not local UI state.
         */
        await page.reload();

        await expect(
          page.getByTestId(
            "decision-badge",
          ),
        ).toContainText(
          "Approved",
        );
      },
    );

    test(
      "enforces separation of duties through the real backend",
      async ({
        page,
      }) => {
        await loginAs(
          page,
          "platform_administrator",
        );

        /*
         * This case was submitted by Bob,
         * the same authenticated user.
         */
        await page.goto(
          `/approvals/${OWN_CASE_ID}`,
        );

        await page
          .getByTestId(
            "approve-case",
          )
          .click();

        await expect(
          page.getByTestId(
            "decision-error",
          ),
        ).toContainText(
          /different user/i,
        );

        /*
         * Bypass the button and call the
         * frontend tRPC endpoint directly.
         *
         * The backend must still reject it.
         */
        const response =
          await page.request.post(
            "/api/trpc/governance.decide",
            {
              data: {
                json: {
                  id:
                    OWN_CASE_ID,

                  decision:
                    "approved",
                },
              },
            },
          );

        expect(
          response.status(),
        ).toBe(
          403,
        );

        const body =
          await response.json();

        expect(
          body.error.json.data.code,
        ).toBe(
          "FORBIDDEN",
        );
      },
    );
  },
);
