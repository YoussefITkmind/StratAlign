import { appRouter, mergeRouters, router } from "./index";
import { strategyRouter } from "./strategy";
import { strategyHierarchyRouter } from "./strategyHierarchy";
import { strategyBriefRouter } from "./strategy-brief";
import { scorecardRouter } from "./scorecard";
import { executionRouter } from "./execution";
import { portfolioRouter } from "./portfolio";
import { schedulerRouter } from "./scheduler";
import { valueRouter } from "./value";
import { aiSuggestionRouter } from "./ai-suggestion";
import { integrationsRouter } from "./integrations";
import { assistantRouter } from "./assistant";
import { pixelRagRouter } from "./pixelrag";
import { pixelRagDocumentManagementRouter } from "./pixelrag-document-management";
import { pixelRagVisualRouter } from "./pixelrag-visual";

export const rootRouter = mergeRouters(
  appRouter,
  router({
    strategy: strategyRouter,
    strategyHierarchy: strategyHierarchyRouter,
    strategyBrief: strategyBriefRouter,
    scorecard: scorecardRouter,
    execution: executionRouter,
    portfolio: portfolioRouter,
    scheduler: schedulerRouter,
    value: valueRouter,
    aiSuggestion: aiSuggestionRouter,
    integrations: integrationsRouter,
    assistant: assistantRouter,
    pixelrag: pixelRagRouter,
    pixelragDocuments: pixelRagDocumentManagementRouter,
    pixelragVisual: pixelRagVisualRouter,
  }),
);

export type AppRouter = typeof rootRouter;
