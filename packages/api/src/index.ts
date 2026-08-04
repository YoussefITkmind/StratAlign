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

export interface LoginRateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
}

export interface LoginRateLimiterContract {
  consume(
    clientIp: string,
    email: string,
  ): Promise<LoginRateLimitResult>;

  reset(
    clientIp: string,
    email: string,
  ): Promise<void>;
}

export interface TrpcContext {
  health: HealthServiceContract;
  credentials: CredentialServiceContract;
  loginRateLimiter: LoginRateLimiterContract;
  clientIp: string;
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
        const rateLimit =
          await ctx.loginRateLimiter.consume(
            ctx.clientIp,
            input.email,
          );

        if (!rateLimit.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message:
              "Too many login attempts. Please try again later.",
          });
        }

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

        await ctx.loginRateLimiter.reset(
          ctx.clientIp,
          input.email,
        );

        return user;
      }),
  }),
});

export type AppRouter = typeof appRouter;