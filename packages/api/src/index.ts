import { initTRPC, TRPCError } from "@trpc/server";
import {
  boundedIdentifierSchema,
  createScopePredicate,
  orgScopeTypeSchema,
  platformRoleSchema,
  StepUpRequiredError,
  type AuthorizationState,
  type PlatformRole,
  type ScopePredicate,
  type StepUpActionClass,
} from "@spm/domain-iam";
import { z } from "zod";

export interface HealthStatus {
  status: string;
  service: string;
  database: string;
  redis: string;
  timestamp: string;
  uptimeSeconds: number;
}
export interface HealthServiceContract { check(): Promise<HealthStatus>; }

export interface AuthenticatedUser { id: string; email: string; displayName: string | null; }
export interface CredentialServiceContract {
  authenticate(email: string, password: string): Promise<AuthenticatedUser | null>;
}
export interface LoginRateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
}
export interface LoginRateLimiterContract {
  consume(clientIp: string, email: string): Promise<LoginRateLimitResult>;
  reset(clientIp: string, email: string): Promise<void>;
}
export interface AuthenticatedSession {
  user: { id: string; email: string | null; name: string | null };
  authenticatedAt: Date;
  sessionId: string;
  expiresAt: Date;
  authenticationMethod: "credentials" | "oidc" | null;
}
export interface OidcReconciliationServiceContract {
  reconcile(idToken: string): Promise<AuthenticatedUser>;
}
export interface AuthenticationFreshnessContract {
  record(session: AuthenticatedSession, authenticatedAt?: Date): Promise<void>;
}
export interface IamAuthorizationServiceContract {
  resolve(session: AuthenticatedSession): Promise<AuthorizationState>;
}
export interface SafeGroupMapping {
  id: string; groupClaim: string; roleName: PlatformRole;
  orgScopeType: "group" | "sector" | "function"; orgScopeId: string;
  version: number; isCurrent: boolean; supersedesId: string | null;
  createdAt: Date; createdBy: string;
}
export interface SafeScopeGrant {
  id: string; userId: string; roleName: PlatformRole;
  orgScopeType: "group" | "sector" | "function"; orgScopeId: string;
  grantedAt: Date; grantedBy: string;
}
export interface IamAdminServiceContract {
  listRoles(): Promise<Array<{ id: string; name: PlatformRole; description: string }>>;
  listGroupMappings(): Promise<SafeGroupMapping[]>;
  upsertGroupMapping(input: {
    groupClaim: string; roleName: PlatformRole; orgScopeType: "group" | "sector" | "function";
    orgScopeId: string; createdBy: string;
  }): Promise<SafeGroupMapping>;
  grantScope(input: {
    userEmail: string; roleName: PlatformRole; orgScopeType: "group" | "sector" | "function";
    orgScopeId: string; grantedBy: string;
  }): Promise<SafeScopeGrant>;
  listCredentialUsers(): Promise<unknown[]>;
  listScopeGrants(): Promise<unknown[]>;
  getStepUpPolicy(actionClass: string): Promise<{
    requiresStepUp: boolean; maxSessionAgeSeconds: number;
  } | null>;
}

export interface TrpcContext {
  health: HealthServiceContract;
  credentials: CredentialServiceContract;
  loginRateLimiter: LoginRateLimiterContract;
  clientIp: string;
  session: AuthenticatedSession | null;
  oidcIdentities: OidcReconciliationServiceContract;
  authenticationFreshness: AuthenticationFreshnessContract;
  authorization: IamAuthorizationServiceContract;
  iam: IamAdminServiceContract;
}

type ProcedureMeta = { actionClass?: StepUpActionClass };
const t = initTRPC.context<TrpcContext>().meta<ProcedureMeta>().create({
  errorFormatter({ shape, error }) {
    const cause = error.cause;
    return {
      ...shape,
      data: {
        ...shape.data,
        stepUpRequired: cause instanceof StepUpRequiredError || undefined,
        actionClass: cause instanceof StepUpRequiredError ? cause.actionClass : undefined,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

export const withAuthn = middleware(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

export const withScopeFilter = middleware(async ({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }
  const authorizationState = await ctx.authorization.resolve(ctx.session);
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      authorizationState,
      scopePredicate: createScopePredicate(authorizationState.scopeGrants),
    },
  });
});

export const withStepUpCheck = middleware(async ({ ctx, meta, next }) => {
  const actionClass = meta?.actionClass;
  if (!actionClass) return next({ ctx });
  const authorized = ctx as typeof ctx & {
    authorizationState: AuthorizationState;
    scopePredicate: ScopePredicate;
  };
  const policy = await ctx.iam.getStepUpPolicy(actionClass);
  if (!policy) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to authorize action" });
  }
  const ageSeconds = (Date.now() - authorized.authorizationState.authenticatedAt.getTime()) / 1_000;
  if (policy.requiresStepUp && ageSeconds > policy.maxSessionAgeSeconds) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This action requires you to re-authenticate.",
      cause: new StepUpRequiredError(actionClass),
    });
  }
  return next({ ctx: authorized });
});

export const protectedProcedure = publicProcedure.use(withAuthn);
export const scopedProcedure = protectedProcedure.use(withScopeFilter);

export function requireRole(...requiredRoles: [PlatformRole, ...PlatformRole[]]) {
  return scopedProcedure.use(({ ctx, next }) => {
    if (!requiredRoles.some((role) => ctx.authorizationState.roles.includes(role))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" });
    }
    return next({ ctx });
  });
}

const oidcIdTokenInput = z.object({ idToken: z.string().trim().min(1).max(16 * 1024) }).strict();
const reconciledOidcUserOutput = z.object({
  id: z.string().uuid(), email: z.string().email(), displayName: z.string().nullable(),
}).strict();
const expectedOidcErrors = new Set([
  "INVALID_IDENTITY_TOKEN", "IDENTITY_CANNOT_BE_PROVISIONED", "ACCOUNT_LINKING_NOT_ALLOWED",
]);
function isExpectedOidcError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    typeof error.code === "string" && expectedOidcErrors.has(error.code);
}

const mappingOutput = z.object({
  id: z.string().uuid(), groupClaim: boundedIdentifierSchema,
  roleName: platformRoleSchema, orgScopeType: orgScopeTypeSchema,
  orgScopeId: boundedIdentifierSchema, version: z.number().int().positive(),
  isCurrent: z.boolean(), supersedesId: z.string().uuid().nullable(),
  createdAt: z.date(), createdBy: z.string().uuid(),
}).strict();
const grantOutput = z.object({
  id: z.string().uuid(), userId: z.string().uuid(), roleName: platformRoleSchema,
  orgScopeType: orgScopeTypeSchema, orgScopeId: boundedIdentifierSchema,
  grantedAt: z.date(), grantedBy: z.string().uuid(),
}).strict();
const admin = () => requireRole("platform_administrator");

export const appRouter = router({
  health: router({
    check: publicProcedure.query(({ ctx }) => ctx.health.check()),
  }),
  auth: router({
    session: protectedProcedure.query(({ ctx }) => ({
      user: ctx.session.user,
      authenticationMethod: ctx.session.authenticationMethod,
    })),
    reconcileOidc: publicProcedure.input(oidcIdTokenInput).output(reconciledOidcUserOutput)
      .mutation(async ({ ctx, input }) => {
        try {
          const user = await ctx.oidcIdentities.reconcile(input.idToken);
          return user;
        } catch (error) {
          if (isExpectedOidcError(error)) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Unable to sign in" });
          }
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to sign in" });
        }
      }),
    login: publicProcedure.input(z.object({
      email: z.string().trim().email(), password: z.string().min(1).max(256),
    }).strict()).mutation(async ({ ctx, input }) => {
      const limit = await ctx.loginRateLimiter.consume(ctx.clientIp, input.email);
      if (!limit.allowed) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many login attempts. Please try again later." });
      }
      const user = await ctx.credentials.authenticate(input.email, input.password);
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      await ctx.loginRateLimiter.reset(ctx.clientIp, input.email);
      return user;
    }),
  }),
  iam: router({
    authorization: scopedProcedure.query(({ ctx }) => ctx.authorizationState),
    listRoles: admin().output(z.array(z.object({
      id: z.string().uuid(), name: platformRoleSchema, description: z.string(),
    }).strict())).query(({ ctx }) => ctx.iam.listRoles()),
    listGroupMappings: admin().output(z.array(mappingOutput)).query(({ ctx }) => ctx.iam.listGroupMappings()),
    upsertGroupMapping: admin().meta({ actionClass: "mapping_change" }).use(withStepUpCheck)
      .input(z.object({
        groupClaim: boundedIdentifierSchema, roleName: platformRoleSchema,
        orgScopeType: orgScopeTypeSchema, orgScopeId: boundedIdentifierSchema,
      }).strict()).output(mappingOutput).mutation(async ({ ctx, input }) => {
        try {
          return await ctx.iam.upsertGroupMapping({ ...input, createdBy: ctx.session!.user.id });
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Unable to update mapping" });
        }
      }),
    grantScope: admin().meta({ actionClass: "role_grant" }).use(withStepUpCheck)
      .input(z.object({
        userEmail: z.string().trim().email().max(320), roleName: platformRoleSchema,
        orgScopeType: orgScopeTypeSchema, orgScopeId: boundedIdentifierSchema,
      }).strict()).output(grantOutput).mutation(async ({ ctx, input }) => {
        try {
          return await ctx.iam.grantScope({ ...input, grantedBy: ctx.session!.user.id });
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Unable to update access" });
        }
      }),
    listCredentialUsers: admin().query(({ ctx }) => ctx.iam.listCredentialUsers()),
    listScopeGrants: admin().query(({ ctx }) => ctx.iam.listScopeGrants()),
    verifyStepUp: admin().input(z.object({ password: z.string().min(1).max(256) }).strict())
      .mutation(async ({ ctx, input }) => {
        const email = ctx.session.user.email;
        if (!email) throw new TRPCError({ code: "UNAUTHORIZED", message: "Unable to re-authenticate" });
        const limit = await ctx.loginRateLimiter.consume(ctx.clientIp, email);
        if (!limit.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Unable to re-authenticate" });
        const user = await ctx.credentials.authenticate(email, input.password);
        if (!user || user.id !== ctx.session.user.id) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Unable to re-authenticate" });
        }
        await Promise.all([
          ctx.loginRateLimiter.reset(ctx.clientIp, email),
          ctx.authenticationFreshness.record(ctx.session),
        ]);
        return { verifiedAt: new Date() };
      }),
  }),
});

export type AppRouter = typeof appRouter;
