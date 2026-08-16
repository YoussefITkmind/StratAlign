import { appRouter, mergeRouters, router } from "./index";
import { strategyRouter } from "./strategy";
import { scorecardRouter } from "./scorecard";
import { executionRouter } from "./execution";
import { portfolioRouter } from "./portfolio";
import { schedulerRouter } from "./scheduler";
import { valueRouter } from "./value";

export const rootRouter = mergeRouters(
  appRouter,
  router({
    strategy: strategyRouter,
    scorecard: scorecardRouter,
    execution: executionRouter,
    portfolio: portfolioRouter,
    scheduler: schedulerRouter,
    value: valueRouter,
  }),
);

export type AppRouter = typeof rootRouter;
