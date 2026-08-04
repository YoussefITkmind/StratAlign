import {
  initTRPC,
  TRPCError,
} from "@trpc/server";
import { z } from "zod";

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

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface CredentialServiceContract {
  authenticate(
    email: string,
    password: string,
  ): Promise<AuthenticatedUser | null>;
}

export interface TrpcContext {
  health: HealthServiceContract;
  credentials: CredentialServiceContract;
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

  auth: router({
    login: publicProcedure
      .input(
        z.object({
          email: z.string().trim().email(),
          password: z.string().min(1).max(256),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const user = await ctx.credentials.authenticate(
          input.email,
          input.password,
        );

        if (!user) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          });
        }

        return user;
      }),
  }),
});

export type AppRouter = typeof appRouter;