import { router } from "@/server/trpc";
import { iamRouter } from "@/server/routers/iam";
import { auditRouter } from "@/server/routers/audit";
import { governanceRouter } from "@/server/routers/governance";
import { registryRouter } from "@/server/routers/registry";
import { rulesRouter } from "@/server/routers/rules";
import { strategyRouter } from "@/server/routers/strategy";
import { captureRouter } from "@/server/routers/capture";
import { scorecardRouter } from "@/server/routers/scorecard";
import { homeRouter } from "@/server/routers/home";
import { executionRouter } from "@/server/routers/execution";
import { valueGateRouter } from "@/server/routers/value-gate";

export const appRouter = router({
  iam: iamRouter,
  audit: auditRouter,
  governance: governanceRouter,
  registry: registryRouter,
  rules: rulesRouter,
  strategy: strategyRouter,
  capture: captureRouter,
  scorecard: scorecardRouter,
  home: homeRouter,
  execution: executionRouter,
  valueGate: valueGateRouter,
});

export type AppRouter = typeof appRouter;
