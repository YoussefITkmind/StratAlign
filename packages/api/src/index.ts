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

import {
  evaluateRule,
  parseRuleInput,
  ruleDocumentSchema,
  type RuleDocument,
  type RuleResult,
  type RuleType,
} from "@spm/rules";
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

export interface RuleDefinitionOutput {
  id: string;
  ruleKey: string;
  ruleType: RuleType;
  name: string;
  document: RuleDocument;
  version: number;
  status: "draft" | "published" | "superseded";
  isCurrent: boolean;
  publishedAt: Date | null;
  supersedesId: string | null;
  createdAt: Date;
  createdBy: string;
}

export interface AuditReconstructionOutput {
  source: "snapshot" | "replay";
  aggregateType: string;
  aggregateId: string;
  asOf: Date;
  version: number | null;
  data: unknown;
}

export interface AuditJournalEntryOutput {
  id: string;
  sourceEventId: string | null;
  sequenceNumber: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  correlationId: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  occurredAt: Date;
  previousHash: string | null;
  entryHash: string;
}

export interface AuditServiceContract {
  reconstructAsOf(input: {
    aggregateType: string;
    aggregateId: string;
    asOf: Date;
  }): Promise<AuditReconstructionOutput | null>;  listEntries(input: {
    eventType?: string;
    aggregateType?: string;
    aggregateId?: string;
    actor?: string;
    from?: Date;
    to?: Date;
    limit: number;
  }): Promise<AuditJournalEntryOutput[]>;
}


export interface RulesServiceContract {
  createDraft(input: {
    ruleKey: string;
    name: string;
    document: RuleDocument;
    createdBy: string;
  }): Promise<RuleDefinitionOutput>;

  publish(ruleId: string): Promise<RuleDefinitionOutput>;

  list(): Promise<RuleDefinitionOutput[]>;

  getVersion(
    ruleKey: string,
    version: number,
  ): Promise<RuleDefinitionOutput | null>;

  evaluate(
  ruleId: string,
  input: unknown,
): Promise<RuleResult>;
}

// ---------------------------------------------------------------------------
// Performance data (Prompt 2.7)
// ---------------------------------------------------------------------------

export type MeasurementSourceValue = "MANUAL" | "FEED" | "TEMPLATE";
export type CaptureSessionStateValue = "DRAFT" | "SUBMITTED" | "RECALLED";

export interface MeasurementOutput {
  id: string;
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  value: number;
  source: MeasurementSourceValue;
  locked: boolean;
  supersedesId: string | null;
  submittedBy: string;
  evidenceRef: string | null;
  createdAt: Date;
}

export interface CaptureSessionOutput {
  id: string;
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  state: CaptureSessionStateValue;
  ownerId: string;
  submittedMeasurementId: string | null;
  submittedAt: Date | null;
  recalledAt: Date | null;
  recallDeadlineAt: Date | null;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommentaryOutput {
  id: string;
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  authorId: string;
  bodyEn: string | null;
  bodyAr: string | null;
  createdAt: Date;
}

export interface StatusResultOutput {
  id: string;
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  status: string;
  computedAt: Date;
  ruleVersionUsed: string;
}

export interface RollupResultOutput {
  id: string;
  parentKpiId: string;
  scopeNodeId: string;
  period: string;
  aggregatedValue: number | null;
  method: string;
  computedAt: Date;
  ruleVersionUsed: string;
}

export interface PerformanceServiceContract {
  startCaptureSession(input: {
    kpiVersionId: string;
    scopeNodeId: string;
    period: string;
    ownerId: string;
    recallDeadlineAt?: Date | null;
  }): Promise<CaptureSessionOutput>;

  submitCaptureSession(input: {
    sessionId: string;
    actorId: string;
    value: number;
    evidenceRef?: string | null;
  }): Promise<{
    session: CaptureSessionOutput;
    measurement: MeasurementOutput;
  }>;

  recallCaptureSession(input: {
    sessionId: string;
    actorId: string;
    actorIsDataSteward: boolean;
  }): Promise<CaptureSessionOutput>;

  listMeasurements(input: {
    kpiVersionId?: string;
    scopeNodeId?: string;
    period?: string;
    asOf?: Date;
    limit: number;
  }): Promise<MeasurementOutput[]>;

  addCommentary(input: {
    kpiVersionId: string;
    scopeNodeId: string;
    period: string;
    authorId: string;
    bodyEn?: string | null;
    bodyAr?: string | null;
  }): Promise<CommentaryOutput>;

  getStatus(input: {
    kpiVersionId: string;
    scopeNodeId: string;
    period: string;
  }): Promise<StatusResultOutput | null>;

  getRollup(input: {
    parentKpiId: string;
    scopeNodeId: string;
    period: string;
  }): Promise<RollupResultOutput | null>;
}

export interface AuditTapServiceContract {
  recordCompletedCall(input: {
    procedurePath: string;
    procedureType: "query" | "mutation" | "subscription";
    actorUserId: string | null;
    occurredAt: Date;
  }): Promise<void>;
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
  rules: RulesServiceContract;
  audit: AuditServiceContract;
  auditTap: AuditTapServiceContract;
  performance: PerformanceServiceContract;
}

type ProcedureMeta = {
  actionClass?: StepUpActionClass;
  auditRelevant?: boolean;
};
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

export const withAuditTap = middleware(
  async ({ ctx, meta, path, type, next }) => {
    const result = await next();

    if (!result.ok) {
      return result;
    }

    const auditRelevant =
      meta?.auditRelevant ??
      (type === "mutation");

    if (!auditRelevant) {
      return result;
    }

    await ctx.auditTap.recordCompletedCall({
      procedurePath: path,
      procedureType: type,
      actorUserId: ctx.session?.user.id ?? null,
      occurredAt: new Date(),
    });

    return result;
  },
);

export const publicProcedure = t.procedure.use(withAuditTap);
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

const rulesPreviewInputSchema = z.object({
  draftDocument: ruleDocumentSchema,
  sampleData: z.unknown(),
}).strict();

const ruleDefinitionOutputSchema = z.object({
  id: z.string().uuid(),
  ruleKey: z.string(),
  ruleType: z.enum([
    "threshold_status",
    "rollup",
    "variance_alert",
    "rag_aggregation",
    "gate_criteria",
  ]),
  name: z.string(),
  document: ruleDocumentSchema,
  version: z.number().int().positive(),
  status: z.enum([
    "draft",
    "published",
    "superseded",
  ]),
  isCurrent: z.boolean(),
  publishedAt: z.date().nullable(),
  supersedesId: z.string().uuid().nullable(),
  createdAt: z.date(),
  createdBy: z.string().uuid(),
}).strict();

const rulesCreateInputSchema = z.object({
  ruleKey: z.string().trim().min(1).max(150),
  name: z.string().trim().min(1).max(200),
  document: ruleDocumentSchema,
}).strict();

const rulesPublishInputSchema = z.object({
  ruleId: z.string().uuid(),
}).strict();

const rulesEvaluateInputSchema = z.object({
  ruleId: z.string().uuid(),
  input: z.unknown(),
}).strict();

const auditListEntriesInputSchema = z.object({
  eventType: z.string().trim().min(1).max(200).optional(),
  aggregateType: z.string().trim().min(1).max(150).optional(),
  aggregateId: z.string().trim().min(1).max(200).optional(),
  actor: z.string().trim().min(1).max(320).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.number().int().min(1).max(200).default(50),
}).strict();

const auditJournalEntryOutputSchema = z.object({
  id: z.string().uuid(),
  sourceEventId: z.string().nullable(),
  sequenceNumber: z.string(),
  eventType: z.string(),
  aggregateType: z.string(),
  aggregateId: z.string(),
  payload: z.unknown(),
  correlationId: z.string().nullable(),
  actorUserId: z.string().nullable(),
  actorEmail: z.string().email().nullable(),
  occurredAt: z.date(),
  previousHash: z.string().nullable(),
  entryHash: z.string(),
}).strict();

const auditReconstructAsOfInputSchema = z.object({
  aggregateType: z.string().trim().min(1).max(150),
  aggregateId: z.string().trim().min(1).max(200),
  asOf: z.coerce.date(),
}).strict();

const auditReconstructionOutputSchema = z.object({
  source: z.enum(["snapshot", "replay"]),
  aggregateType: z.string(),
  aggregateId: z.string(),
  asOf: z.date(),
  version: z.number().int().positive().nullable(),
  data: z.unknown(),
}).strict().nullable();

// ---------------------------------------------------------------------------
// Performance schemas and error mapping
// ---------------------------------------------------------------------------

const periodSchema = z.string().trim().min(1).max(50);
const evidenceRefSchema = z.string().trim().min(1).max(1024);

/**
 * Domain failures are mapped to transport codes here, and nothing else is: an
 * unrecognised error becomes a generic INTERNAL_SERVER_ERROR so SQL text,
 * Prisma stack traces and worker internals can never reach a client.
 */
const PERFORMANCE_ERROR_CODES = {
  INVALID_CAPTURE_TRANSITION: "CONFLICT",
  CAPTURE_SESSION_NOT_FOUND: "NOT_FOUND",
  DUPLICATE_ACTIVE_SESSION: "CONFLICT",
  RECALL_CUTOFF_REACHED: "CONFLICT",
  RECALL_NOT_PERMITTED: "FORBIDDEN",
  MEASUREMENT_LOCKED: "CONFLICT",
  FEED_MEASUREMENT_LOCKED: "CONFLICT",
  INVALID_SUPERSESSION: "CONFLICT",
  MEASUREMENT_NOT_FOUND: "NOT_FOUND",
  COMMENTARY_CONTENT_REQUIRED: "BAD_REQUEST",
  KPI_BINDING_NOT_FOUND: "NOT_FOUND",
  RULE_NOT_FOUND: "NOT_FOUND",
  RULE_EVALUATION_FAILED: "INTERNAL_SERVER_ERROR",
} as const satisfies Record<string, TRPCError["code"]>;

type PerformanceErrorCode = keyof typeof PERFORMANCE_ERROR_CODES;

function isMappedPerformanceError(
  error: unknown,
): error is { code: PerformanceErrorCode; message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    (error as { code: string }).code in PERFORMANCE_ERROR_CODES
  );
}

async function mapPerformanceErrors<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isMappedPerformanceError(error)) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to complete performance operation",
      });
    }

    const code = PERFORMANCE_ERROR_CODES[error.code];

    throw new TRPCError({
      code,
      message:
        code === "INTERNAL_SERVER_ERROR"
          ? "Unable to complete performance operation"
          : error.message,
    });
  }
}

const measurementOutputSchema = z.object({
  id: z.string().uuid(),
  kpiVersionId: boundedIdentifierSchema,
  scopeNodeId: boundedIdentifierSchema,
  period: periodSchema,
  value: z.number().finite(),
  source: z.enum(["MANUAL", "FEED", "TEMPLATE"]),
  locked: z.boolean(),
  supersedesId: z.string().uuid().nullable(),
  submittedBy: z.string().uuid(),
  evidenceRef: z.string().nullable(),
  createdAt: z.date(),
}).strict();

const captureSessionOutputSchema = z.object({
  id: z.string().uuid(),
  kpiVersionId: boundedIdentifierSchema,
  scopeNodeId: boundedIdentifierSchema,
  period: periodSchema,
  state: z.enum(["DRAFT", "SUBMITTED", "RECALLED"]),
  ownerId: z.string().uuid(),
  submittedMeasurementId: z.string().uuid().nullable(),
  submittedAt: z.date().nullable(),
  recalledAt: z.date().nullable(),
  recallDeadlineAt: z.date().nullable(),
  consumedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
}).strict();

const commentaryOutputSchema = z.object({
  id: z.string().uuid(),
  kpiVersionId: boundedIdentifierSchema,
  scopeNodeId: boundedIdentifierSchema,
  period: periodSchema,
  authorId: z.string().uuid(),
  bodyEn: z.string().nullable(),
  bodyAr: z.string().nullable(),
  createdAt: z.date(),
}).strict();

const statusResultOutputSchema = z.object({
  id: z.string().uuid(),
  kpiVersionId: boundedIdentifierSchema,
  scopeNodeId: boundedIdentifierSchema,
  period: periodSchema,
  status: z.string(),
  computedAt: z.date(),
  ruleVersionUsed: z.string().uuid(),
}).strict();

const rollupResultOutputSchema = z.object({
  id: z.string().uuid(),
  parentKpiId: boundedIdentifierSchema,
  scopeNodeId: boundedIdentifierSchema,
  period: periodSchema,
  aggregatedValue: z.number().finite().nullable(),
  method: z.string(),
  computedAt: z.date(),
  ruleVersionUsed: z.string().uuid(),
}).strict();

const captureStartSessionInputSchema = z.object({
  kpiVersionId: boundedIdentifierSchema,
  scopeNodeId: boundedIdentifierSchema,
  period: periodSchema,
  recallDeadlineAt: z.coerce.date().optional(),
}).strict();

const captureSubmitInputSchema = z.object({
  sessionId: z.string().uuid(),
  value: z.number().finite(),
  evidenceRef: evidenceRefSchema.optional(),
}).strict();

const captureRecallInputSchema = z.object({
  sessionId: z.string().uuid(),
}).strict();

const measurementListInputSchema = z.object({
  kpiVersionId: boundedIdentifierSchema.optional(),
  scopeNodeId: boundedIdentifierSchema.optional(),
  period: periodSchema.optional(),
  /** Omitted resolves the currently effective measurement. */
  asOf: z.coerce.date().optional(),
  limit: z.number().int().min(1).max(200).default(50),
}).strict();

const commentaryAddInputSchema = z.object({
  kpiVersionId: boundedIdentifierSchema,
  scopeNodeId: boundedIdentifierSchema,
  period: periodSchema,
  bodyEn: z.string().trim().min(1).max(5000).optional(),
  bodyAr: z.string().trim().min(1).max(5000).optional(),
}).strict().refine(
  (input) => input.bodyEn !== undefined || input.bodyAr !== undefined,
  { message: "Commentary must contain English or Arabic content" },
);

const statusGetInputSchema = z.object({
  kpiVersionId: boundedIdentifierSchema,
  scopeNodeId: boundedIdentifierSchema,
  period: periodSchema,
}).strict();

const rollupGetInputSchema = z.object({
  parentKpiId: boundedIdentifierSchema,
  scopeNodeId: boundedIdentifierSchema,
  period: periodSchema,
}).strict();

const rulesGetVersionInputSchema = z.object({
  ruleKey: z.string().trim().min(1).max(150),
  version: z.number().int().positive(),
}).strict();

export const appRouter = router({
  health: router({
    check: publicProcedure.query(({ ctx }) => ctx.health.check()),
  }),

  audit: router({
    listEntries: requireRole("platform_administrator")
      .input(auditListEntriesInputSchema)
      .output(z.array(auditJournalEntryOutputSchema))
      .query(({ ctx, input }) => ctx.audit.listEntries(input)),

    reconstructAsOf: requireRole("platform_administrator")
      .input(auditReconstructAsOfInputSchema)
      .output(auditReconstructionOutputSchema)
      .query(({ ctx, input }) => ctx.audit.reconstructAsOf(input)),
  }),
  rules: router({
    create: protectedProcedure
      .input(rulesCreateInputSchema)
      .output(ruleDefinitionOutputSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await ctx.rules.createDraft({
            ...input,
            createdBy: ctx.session.user.id,
          });
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Unable to create rule draft",
          });
        }
      }),

    preview: protectedProcedure
      .input(rulesPreviewInputSchema)
      .mutation(({ input }) => {
        const validatedInput = parseRuleInput(
          input.draftDocument,
          input.sampleData,
        );

        return evaluateRule(
          input.draftDocument,
          validatedInput,
        );
      }),

    publish: requireRole(
      "seo_administrator",
      "strategy_analyst",
    )
      .input(rulesPublishInputSchema)
      .output(ruleDefinitionOutputSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          // TODO(1.5): Replace role gating with
          // workflow-case-gated publication.
          return await ctx.rules.publish(input.ruleId);
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Unable to publish rule",
          });
        }
      }),

    evaluate: protectedProcedure
      .input(rulesEvaluateInputSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await ctx.rules.evaluate(
            input.ruleId,
            input.input,
          );
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Unable to evaluate rule",
          });
        }
      }),

    list: protectedProcedure
      .output(z.array(ruleDefinitionOutputSchema))
      .query(({ ctx }) => ctx.rules.list()),

    getVersion: protectedProcedure
      .input(rulesGetVersionInputSchema)
      .output(ruleDefinitionOutputSchema.nullable())
      .query(({ ctx, input }) =>
        ctx.rules.getVersion(
          input.ruleKey,
          input.version,
        ),
      ),
  }),
  performance: router({
    capture: router({
      startSession: requireRole("kpi_owner", "data_steward")
        .input(captureStartSessionInputSchema)
        .output(captureSessionOutputSchema)
        .mutation(({ ctx, input }) =>
          mapPerformanceErrors(() =>
            ctx.performance.startCaptureSession({
              ...input,
              ownerId: ctx.session.user.id,
            }),
          ),
        ),

      submit: requireRole("kpi_owner", "data_steward")
        .input(captureSubmitInputSchema)
        .output(z.object({
          session: captureSessionOutputSchema,
          measurement: measurementOutputSchema,
        }).strict())
        .mutation(({ ctx, input }) =>
          mapPerformanceErrors(() =>
            ctx.performance.submitCaptureSession({
              ...input,
              actorId: ctx.session.user.id,
            }),
          ),
        ),

      recall: requireRole("kpi_owner", "data_steward")
        .input(captureRecallInputSchema)
        .output(captureSessionOutputSchema)
        .mutation(({ ctx, input }) =>
          mapPerformanceErrors(() =>
            ctx.performance.recallCaptureSession({
              sessionId: input.sessionId,
              actorId: ctx.session.user.id,
              actorIsDataSteward:
                ctx.authorizationState.roles.includes("data_steward"),
            }),
          ),
        ),
    }),

    measurement: router({
      list: protectedProcedure
        .input(measurementListInputSchema)
        .output(z.array(measurementOutputSchema))
        .query(({ ctx, input }) =>
          mapPerformanceErrors(() =>
            ctx.performance.listMeasurements(input),
          ),
        ),
    }),

    commentary: router({
      add: requireRole("kpi_owner", "data_steward", "strategy_analyst")
        .input(commentaryAddInputSchema)
        .output(commentaryOutputSchema)
        .mutation(({ ctx, input }) =>
          mapPerformanceErrors(() =>
            ctx.performance.addCommentary({
              ...input,
              authorId: ctx.session.user.id,
            }),
          ),
        ),
    }),

    status: router({
      get: protectedProcedure
        .input(statusGetInputSchema)
        .output(statusResultOutputSchema.nullable())
        .query(({ ctx, input }) =>
          mapPerformanceErrors(() => ctx.performance.getStatus(input)),
        ),
    }),

    rollup: router({
      get: protectedProcedure
        .input(rollupGetInputSchema)
        .output(rollupResultOutputSchema.nullable())
        .query(({ ctx, input }) =>
          mapPerformanceErrors(() => ctx.performance.getRollup(input)),
        ),
    }),
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
