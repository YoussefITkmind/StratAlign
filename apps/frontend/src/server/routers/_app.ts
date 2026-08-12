import { router } from "@/server/trpc";
import { iamRouter } from "@/server/routers/iam";
import { auditRouter } from "@/server/routers/audit";
import { governanceRouter } from "@/server/routers/governance";
import { registryRouter } from "@/server/routers/registry";
import { rulesRouter } from "@/server/routers/rules";
import { strategyRouter } from "@/server/routers/strategy";
import { captureRouter } from "@/server/routers/capture";

export const appRouter = router({
  iam: iamRouter,
  audit: auditRouter,
  governance: governanceRouter,
  registry: registryRouter,
  rules: rulesRouter,
  strategy: strategyRouter,
  capture: captureRouter,
});

export type AppRouter = typeof appRouter;
