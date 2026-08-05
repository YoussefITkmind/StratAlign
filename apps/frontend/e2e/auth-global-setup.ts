import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(__dirname, "../../..");

export default async function authGlobalSetup(): Promise<void> {
  process.env.E2E_MEMBER_EMAIL ??= "alice@example.test";
  process.env.E2E_ADMIN_EMAIL ??= "bob@example.test";
  process.env.E2E_CREDENTIAL_PASSWORD ??= "LocalTestPassword123!";

  await execFileAsync(
    "docker",
    ["compose", "up", "-d", "postgres", "redis", "mock-oidc"],
    { cwd: workspaceRoot },
  );
  await execFileAsync(
    "docker",
    ["compose", "up", "-d", "--force-recreate", "mock-oidc"],
    { cwd: workspaceRoot },
  );
  await execFileAsync(
    "pnpm",
    ["--filter", "@spm/backend", "exec", "prisma", "migrate", "deploy"],
    { cwd: workspaceRoot },
  );
  await execFileAsync(
    "pnpm",
    ["--filter", "@spm/backend", "exec", "prisma", "db", "seed"],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        SEED_TEST_USER_PASSWORD: process.env.E2E_CREDENTIAL_PASSWORD,
      },
    },
  );
  await execFileAsync(
    "docker",
    [
      "compose", "exec", "-T", "postgres", "psql", "-U", "spm", "-d", "spm_platform",
      "-c", "UPDATE iam.step_up_policies SET max_session_age_seconds = 1 WHERE action_class IN ('mapping_change', 'role_grant')",
    ],
    { cwd: workspaceRoot },
  );
}
