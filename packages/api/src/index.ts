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

export interface AuthenticatedSession {
  user: {
    id: string;
    email: string | null;
    name: string | null;
  };
}

export interface OidcReconciliationServiceContract {
  reconcile(idToken: string): Promise<AuthenticatedUser>;
}

export interface TrpcContext {
  health: HealthServiceContract;
  credentials: CredentialServiceContract;
  loginRateLimiter: LoginRateLimiterContract;
  clientIp: string;
  session: AuthenticatedSession | null;
  oidcIdentities: OidcReconciliationServiceContract;
}

const oidcIdTokenInput = z.object({
  idToken: z.string().trim().min(1).max(16 * 1024),
}).strict();

const reconciledOidcUserOutput = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
}).strict();

const expectedOidcReconciliationErrorCodes = new Set([
  "INVALID_IDENTITY_TOKEN",
  "IDENTITY_CANNOT_BE_PROVISIONED",
  "ACCOUNT_LINKING_NOT_ALLOWED",
]);

function isExpectedOidcReconciliationError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    expectedOidcReconciliationErrorCodes.has(error.code)
  );
}

const t = initTRPC.context<TrpcContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

export const withAuthn = middleware(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});

export const protectedProcedure = publicProcedure.use(withAuthn);

export const appRouter = router({
  health: router({
    check: publicProcedure.query(({ ctx }) => {
      return ctx.health.check();
    }),
  }),

  auth: router({
    session: protectedProcedure.query(({ ctx }) => {
      return ctx.session;
    }),

    reconcileOidc: publicProcedure
      .input(oidcIdTokenInput)
      .output(reconciledOidcUserOutput)
      .mutation(async ({ ctx, input }) => {
        try {
          return await ctx.oidcIdentities.reconcile(input.idToken);
        } catch (error) {
          if (isExpectedOidcReconciliationError(error)) {
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "Unable to sign in",
            });
          }

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Unable to sign in",
          });
        }
      }),

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
