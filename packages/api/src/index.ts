import { initTRPC } from "@trpc/server";

export interface HealthStatus {
  status: string;
  service: string;
  database: string;
  redis: string;
  timestamp: string;
  uptimeSeconds: number;
}

export interface HealthServiceContract {
  check(): Promise<HealthStatus>;
}

export interface TrpcContext {
  health: HealthServiceContract;
}

const t = initTRPC.context<TrpcContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

export const appRouter = router({
  health: router({
    check: publicProcedure.query(({ ctx }) => {
      return ctx.health.check();
    }),
  }),
});

export type AppRouter = typeof appRouter;