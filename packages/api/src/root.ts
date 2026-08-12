import { appRouter, mergeRouters, router } from "./index";
import { strategyRouter } from "./strategy";
import { scorecardRouter } from "./scorecard";
import { executionRouter } from "./execution";

export const rootRouter = mergeRouters(
  appRouter,
  router({
    strategy: strategyRouter,
    scorecard: scorecardRouter,
    execution: executionRouter,
  }),
);

export type AppRouter = typeof rootRouter;
