import { router } from "@/server/trpc";
import { authRouter } from "@/server/routers/auth";
import { iamRouter } from "@/server/routers/iam";
import { auditRouter } from "@/server/routers/audit";
import { governanceRouter } from "@/server/routers/governance";
import { registryRouter } from "@/server/routers/registry";
import { rulesRouter } from "@/server/routers/rules";
import { strategyRouter } from "@/server/routers/strategy";
import { strategyHierarchyRouter } from "@/server/routers/strategy-hierarchy";
import { strategyBriefRouter } from "@/server/routers/strategy-brief";
import { captureRouter } from "@/server/routers/capture";
import { scorecardRouter } from "@/server/routers/scorecard";
import { homeRouter } from "@/server/routers/home";
import { executionRouter } from "@/server/routers/execution";
import { valueGateRouter } from "@/server/routers/value-gate";
import { aiSuggestionRouter } from "@/server/routers/ai-suggestion";
import { integrationsRouter } from "@/server/routers/integrations";
import { assistantRouter } from "@/server/routers/assistant";
import { pixelRagRouter } from "@/server/routers/pixelrag";

export const appRouter = router({
  auth: authRouter,
  iam: iamRouter,
  audit: auditRouter,
  governance: governanceRouter,
  registry: registryRouter,
  rules: rulesRouter,
  strategy: strategyRouter,
  strategyHierarchy: strategyHierarchyRouter,
  strategyBrief: strategyBriefRouter,
  capture: captureRouter,
  scorecard: scorecardRouter,
  home: homeRouter,
  execution: executionRouter,
  valueGate: valueGateRouter,
  aiSuggestion: aiSuggestionRouter,
  integrations: integrationsRouter,
  assistant: assistantRouter,
  pixelrag: pixelRagRouter,
});

export type AppRouter = typeof appRouter;
