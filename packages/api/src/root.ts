import { appRouter, mergeRouters, router } from "./index";
import { strategyRouter } from "./strategy";
import { scorecardRouter } from "./scorecard";

export const rootRouter = mergeRouters(
  appRouter,
  router({
    strategy: strategyRouter,
    scorecard: scorecardRouter,
  }),
);

export type AppRouter = typeof rootRouter;
