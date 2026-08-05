import { router } from "@/server/trpc";
import { iamRouter } from "@/server/routers/iam";
import { auditRouter } from "@/server/routers/audit";
import { governanceRouter } from "@/server/routers/governance";

export const appRouter = router({
  iam: iamRouter,
  audit: auditRouter,
  governance: governanceRouter,
});

export type AppRouter = typeof appRouter;
