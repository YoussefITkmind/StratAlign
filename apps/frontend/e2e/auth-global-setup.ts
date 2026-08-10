import { execFile, spawn } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(__dirname, "../../..");

export default async function authGlobalSetup(): Promise<() => Promise<void>> {
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
      "-c", "UPDATE iam.step_up_policies SET max_session_age_seconds = 5 WHERE action_class IN ('mapping_change', 'role_grant')",
    ],
    { cwd: workspaceRoot },
  );

  const worker = spawn(
    "pnpm",
    ["--filter", "@spm/backend", "start:worker"],
    {
      cwd: workspaceRoot,
      env: process.env,
      stdio: "inherit",
      detached: true,
    },
  );

  await new Promise<void>((resolveReady, reject) => {
    const onError = (error: Error) => {
      clearTimeout(timer);
      reject(error);
    };

    const onExit = (code: number | null) => {
      clearTimeout(timer);
      reject(
        new Error(`Backend worker exited during E2E setup with code ${code}`),
      );
    };

    const timer = setTimeout(() => {
      worker.off("error", onError);
      worker.off("exit", onExit);
      resolveReady();
    }, 1500);

    worker.once("error", onError);
    worker.once("exit", onExit);
  });

  return async () => {
    if (!worker.pid || worker.exitCode !== null) {
      return;
    }

    await new Promise<void>((resolveExit, reject) => {
      worker.once("exit", () => resolveExit());

      try {
        process.kill(-worker.pid!, "SIGTERM");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") {
          resolveExit();
          return;
        }
        reject(error);
      }
    });
  };

}
