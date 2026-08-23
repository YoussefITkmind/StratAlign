import { appRouter, mergeRouters, router } from "./index";
import { strategyRouter } from "./strategy";
import { strategyHierarchyRouter } from "./strategyHierarchy";
import { scorecardRouter } from "./scorecard";
import { executionRouter } from "./execution";
import { portfolioRouter } from "./portfolio";
import { schedulerRouter } from "./scheduler";
import { valueRouter } from "./value";
import { aiSuggestionRouter } from "./ai-suggestion";
import { syncLogRouter } from "./sync-log";

export const rootRouter = mergeRouters(
  appRouter,
  router({
    strategy: strategyRouter,
    strategyHierarchy: strategyHierarchyRouter,
    scorecard: scorecardRouter,
    execution: executionRouter,
    portfolio: portfolioRouter,
    scheduler: schedulerRouter,
    value: valueRouter,
    aiSuggestion: aiSuggestionRouter,
    syncLog: syncLogRouter,
  }),
);

export type AppRouter = typeof rootRouter;
