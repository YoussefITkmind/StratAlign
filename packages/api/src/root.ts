import { appRouter, mergeRouters, router } from "./index";
import { strategyRouter } from "./strategy";

export const rootRouter = mergeRouters(
  appRouter,
  router({
    strategy: strategyRouter,
  }),
);

export type AppRouter = typeof rootRouter;
