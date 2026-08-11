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
  }): Promise<AuditReconstructionOutput | null>; listEntries(input: {
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
// Registry (KPI / OKR)
// ---------------------------------------------------------------------------

export type KpiStatusValue = "draft" | "active" | "retired";
export type KpiPolarityValue = "higher_is_better" | "lower_is_better";
export type KpiFrequencyValue = "monthly" | "quarterly";
export type KpiDataSourceTypeValue = "manual" | "feed";
export type KeyResultTypeValue = "quantitative" | "milestone";
export type AlignmentTypeValue =
  | "objective"
  | "play"
  | "sector"
  | "project";

export interface KpiDefinitionOutput {
  id: string;
  activeVersionId: string | null;
  status: KpiStatusValue;
  retiredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface KpiVersionOutput {
  id: string;
  kpiDefinitionId: string;
  version: number;
  nameEn: string;
  nameAr: string;
  descriptionEn: string | null;
  descriptionAr: string | null;
  unit: string;
  polarity: KpiPolarityValue;
  frequency: KpiFrequencyValue;
  dataSourceType: KpiDataSourceTypeValue;
  calculationLogicText: string | null;
  ownerUserId: string;
  stewardUserId: string | null;
  activeFrom: Date;
  supersedesVersionId: string | null;
  approvalCaseId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
}

export interface KpiWithVersionOutput {
  definition: KpiDefinitionOutput;
  version: KpiVersionOutput;
}

export interface KpiSimilarityMatchOutput {
  kpiDefinitionId: string;
  kpiVersionId: string;
  version: number;
  status: KpiStatusValue;
  nameEn: string;
  nameAr: string;
  similarity: number;
  rank: number;
  matchingFields: Array<{
    field: "nameEn" | "nameAr" | "descriptionEn" | "descriptionAr";
    score: number;
  }>;
}

export interface AlignmentOutput {
  id: string;
  kpiDefinitionId: string;
  strategyNodeId: string;
  alignmentType: AlignmentTypeValue;
  createdAt: Date;
}

export interface KpiHierarchyEdgeOutput {
  id: string;
  parentKpiId: string;
  childKpiId: string;
  rollupMethodRuleId: string;
  createdAt: Date;
}

export interface RetirementImpactOutput {
  kpiDefinitionId: string;
  status: KpiStatusValue;
  affectedAlignments: AlignmentOutput[];
  affectedStrategyNodeIds: string[];
  affectedHierarchyEdges: KpiHierarchyEdgeOutput[];
  strategyNodesVerified: boolean;
}

export interface KeyResultOutput {
  id: string;
  okrId: string;
  type: KeyResultTypeValue;
  targetValue: number;
  unit: string;
  currentValue: number | null;
  progressPercent: number | null;
  progressUpdatedAt: Date | null;
}

export interface OkrOutput {
  id: string;
  objectiveNodeId: string;
  nameEn: string;
  nameAr: string;
  createdAt: Date;
  updatedAt: Date;
  keyResults: KeyResultOutput[];
}

export interface RegistryKpiServiceContract {
  createDraft(input: {
    kpiDefinitionId?: string;
    nameEn: string;
    nameAr: string;
    descriptionEn?: string | null;
    descriptionAr?: string | null;
    unit: string;
    polarity: KpiPolarityValue;
    frequency: KpiFrequencyValue;
    dataSourceType: KpiDataSourceTypeValue;
    calculationLogicText?: string | null;
    ownerUserId: string;
    stewardUserId?: string | null;
    activeFrom: Date;
  }): Promise<KpiWithVersionOutput>;

  publishVersion(input: {
    kpiVersionId: string;
    approvalCaseId: string;
  }): Promise<KpiWithVersionOutput>;

  retire(kpiDefinitionId: string): Promise<KpiDefinitionOutput>;

  findSimilar(input: {
    text: string;
    threshold?: number;
    limit?: number;
    excludeKpiDefinitionId?: string;
  }): Promise<KpiSimilarityMatchOutput[]>;

  retirementImpact(
    kpiDefinitionId: string,
  ): Promise<RetirementImpactOutput>;

  listVersions(kpiDefinitionId: string): Promise<KpiVersionOutput[]>;
}

export interface RegistryOkrServiceContract {
  create(input: {
    objectiveNodeId: string;
    nameEn: string;
    nameAr: string;
    keyResults: Array<{
      type: KeyResultTypeValue;
      targetValue: number;
      unit: string;
    }>;
  }): Promise<OkrOutput>;

  updateProgress(input: {
    keyResultId: string;
    currentValue: number;
  }): Promise<KeyResultOutput>;
}

export interface RegistryAlignmentServiceContract {
  set(input: {
    kpiDefinitionId: string;
    alignments: Array<{
      strategyNodeId: string;
      alignmentType: AlignmentTypeValue;
    }>;
  }): Promise<AlignmentOutput[]>;
}

export interface RegistryHierarchyServiceContract {
  setRollup(input: {
    parentKpiId: string;
    childKpiId: string;
    rollupMethodRuleId: string;
  }): Promise<KpiHierarchyEdgeOutput>;
}

export interface RegistryServicesContract {
  kpi: RegistryKpiServiceContract;
  okr: RegistryOkrServiceContract;
  alignment: RegistryAlignmentServiceContract;
  hierarchy: RegistryHierarchyServiceContract;
}

// ---------------------------------------------------------------------------
// Performance Data (Measurements, Targets, Status, Rollups, Commentary)
// ---------------------------------------------------------------------------

export type MeasurementSourceValue = "manual" | "feed" | "template";
export type CaptureSessionStateValue = "draft" | "submitted" | "recalled";

export interface MeasurementOutput {
  id: string;
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  value: number;
  source: MeasurementSourceValue;
  locked: boolean;
  supersedesId: string | null;
  submittedBy: string | null;
  evidenceRef: string | null;
  createdAt: Date;
}

export interface TargetSeriesOutput {
  id: string;
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  targetValue: number;
  planVersionId: string | null;
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
  createdAt: Date;
}

export interface RollupResultOutput {
  id: string;
  parentKpiId: string;
  scopeNodeId: string;
  period: string;
  aggregatedValue: number;
  method: string;
  createdAt: Date;
}

export interface CaptureSessionOutput {
  id: string;
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  state: CaptureSessionStateValue;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PerformanceServiceContract {
  createMeasurement(input: {
    kpiVersionId: string;
    scopeNodeId: string;
    period: string;
    value: number;
    source: MeasurementSourceValue;
    locked?: boolean;
    supersedesId?: string | null;
    submittedBy?: string | null;
    evidenceRef?: string | null;
  }): Promise<MeasurementOutput>;

  listMeasurements(input: {
    kpiVersionId?: string;
    scopeNodeId?: string;
    period?: string;
    asOf?: Date;
    includeSuperseded?: boolean;
  }): Promise<MeasurementOutput[]>;

  getCurrentMeasurement(input: {
    kpiVersionId: string;
    scopeNodeId: string;
    period: string;
  }): Promise<MeasurementOutput | null>;

  getMeasurementAsOf(input: {
    kpiVersionId: string;
    scopeNodeId: string;
    period: string;
    asOf: Date;
  }): Promise<MeasurementOutput | null>;

  addTargetSeries(input: {
    kpiVersionId: string;
    scopeNodeId: string;
    period: string;
    targetValue: number;
    planVersionId?: string | null;
  }): Promise<TargetSeriesOutput>;

  addCommentary(input: {
    kpiVersionId: string;
    scopeNodeId: string;
    period: string;
    authorId: string;
    bodyEn?: string | null;
    bodyAr?: string | null;
  }): Promise<CommentaryOutput>;

  startCaptureSession(input: {
    kpiVersionId: string;
    scopeNodeId: string;
    period: string;
    ownerId: string;
  }): Promise<{ sessionId: string }>;

  submitCaptureSession(input: {
    sessionId: string;
    measurementValue: number;
    evidenceRef?: string | null;
  }): Promise<MeasurementOutput>;

  recallCaptureSession(input: {
    sessionId: string;
  }): Promise<void>;

  getStatusResult(input: {
    kpiVersionId: string;
    scopeNodeId: string;
    period: string;
  }): Promise<StatusResultOutput | null>;

  getRollupResult(input: {
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
  registry: RegistryServicesContract;
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

/** Roles allowed to author registry content. */
const registryAuthor = () =>
  requireRole(
    "kpi_owner",
    "data_steward",
    "strategy_analyst",
    "seo_administrator",
  );

/**
 * Roles allowed to move a KPI's lifecycle. Role membership is necessary but
 * not sufficient for publication: `ApprovalGateway` still has to confirm an
 * approved workflow case.
 */
const registryPublisher = () =>
  requireRole("strategy_analyst", "seo_administrator");

/**
 * Registry services raise `RegistryApprovalError` with a stable `code`, which
 * is duck-typed here for the same reason `isExpectedOidcError` is: the API
 * package must not depend on backend error classes.
 *
 * Approval refusals map to FORBIDDEN so a caller can distinguish "you have not
 * been approved" from "your input was wrong". Neither carries service detail.
 */
function toRegistryError(
  error: unknown,
  fallbackMessage: string,
): TRPCError {
  const isApprovalFailure =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "REGISTRY_APPROVAL_REQUIRED";

  return isApprovalFailure
    ? new TRPCError({
      code: "FORBIDDEN",
      message: "Publication requires an approved workflow case",
    })
    : new TRPCError({ code: "BAD_REQUEST", message: fallbackMessage });
}

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

const rulesGetVersionInputSchema = z.object({
  ruleKey: z.string().trim().min(1).max(150),
  version: z.number().int().positive(),
}).strict();

// ---------------------------------------------------------------------------
// Registry schemas
//
// `strategyNodeId` / `objectiveNodeId` are validated as bounded identifiers
// rather than UUIDs: the Strategy module owns their format and does not exist
// yet, so asserting a shape here would be inventing its contract.
// ---------------------------------------------------------------------------

const kpiStatusSchema = z.enum(["draft", "active", "retired"]);
const kpiPolaritySchema = z.enum(["higher_is_better", "lower_is_better"]);
const kpiFrequencySchema = z.enum(["monthly", "quarterly"]);
const kpiDataSourceTypeSchema = z.enum(["manual", "feed"]);
const keyResultTypeSchema = z.enum(["quantitative", "milestone"]);
const alignmentTypeSchema = z.enum([
  "objective",
  "play",
  "sector",
  "project",
]);

const strategyNodeIdSchema = z.string().trim().min(1).max(200);
const shortTextSchema = z.string().trim().min(1).max(300);
const longTextSchema = z.string().trim().max(4_000);

const kpiDefinitionOutputSchema = z.object({
  id: z.string().uuid(),
  activeVersionId: z.string().uuid().nullable(),
  status: kpiStatusSchema,
  retiredAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
}).strict();

const kpiVersionOutputSchema = z.object({
  id: z.string().uuid(),
  kpiDefinitionId: z.string().uuid(),
  version: z.number().int().positive(),
  nameEn: z.string(),
  nameAr: z.string(),
  descriptionEn: z.string().nullable(),
  descriptionAr: z.string().nullable(),
  unit: z.string(),
  polarity: kpiPolaritySchema,
  frequency: kpiFrequencySchema,
  dataSourceType: kpiDataSourceTypeSchema,
  calculationLogicText: z.string().nullable(),
  ownerUserId: z.string().uuid(),
  stewardUserId: z.string().uuid().nullable(),
  activeFrom: z.date(),
  supersedesVersionId: z.string().uuid().nullable(),
  approvalCaseId: z.string().nullable(),
  publishedAt: z.date().nullable(),
  createdAt: z.date(),
}).strict();

const kpiWithVersionOutputSchema = z.object({
  definition: kpiDefinitionOutputSchema,
  version: kpiVersionOutputSchema,
}).strict();

const registryCreateDraftInputSchema = z.object({
  kpiDefinitionId: z.string().uuid().optional(),
  nameEn: shortTextSchema,
  nameAr: shortTextSchema,
  descriptionEn: longTextSchema.nullish(),
  descriptionAr: longTextSchema.nullish(),
  unit: z.string().trim().min(1).max(50),
  polarity: kpiPolaritySchema,
  frequency: kpiFrequencySchema,
  dataSourceType: kpiDataSourceTypeSchema,
  calculationLogicText: longTextSchema.nullish(),
  ownerUserId: z.string().uuid(),
  stewardUserId: z.string().uuid().nullish(),
  activeFrom: z.coerce.date(),
}).strict();

const registryPublishVersionInputSchema = z.object({
  kpiVersionId: z.string().uuid(),
  // Required, not optional: publication is gated on an approved workflow case
  // and there is no path that publishes without one.
  approvalCaseId: z.string().trim().min(1).max(200),
}).strict();

const registryKpiIdInputSchema = z.object({
  kpiDefinitionId: z.string().uuid(),
}).strict();

const registryFindSimilarInputSchema = z.object({
  text: z.string().trim().min(1).max(300),
  threshold: z.number().min(0).max(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  excludeKpiDefinitionId: z.string().uuid().optional(),
}).strict();

const kpiSimilarityMatchOutputSchema = z.object({
  kpiDefinitionId: z.string().uuid(),
  kpiVersionId: z.string().uuid(),
  version: z.number().int().positive(),
  status: kpiStatusSchema,
  nameEn: z.string(),
  nameAr: z.string(),
  similarity: z.number().min(0).max(1),
  rank: z.number().int().positive(),
  matchingFields: z.array(z.object({
    field: z.enum([
      "nameEn",
      "nameAr",
      "descriptionEn",
      "descriptionAr",
    ]),
    score: z.number().min(0).max(1),
  }).strict()),
}).strict();

const alignmentOutputSchema = z.object({
  id: z.string().uuid(),
  kpiDefinitionId: z.string().uuid(),
  strategyNodeId: z.string(),
  alignmentType: alignmentTypeSchema,
  createdAt: z.date(),
}).strict();

const kpiHierarchyEdgeOutputSchema = z.object({
  id: z.string().uuid(),
  parentKpiId: z.string().uuid(),
  childKpiId: z.string().uuid(),
  rollupMethodRuleId: z.string().uuid(),
  createdAt: z.date(),
}).strict();

const retirementImpactOutputSchema = z.object({
  kpiDefinitionId: z.string().uuid(),
  status: kpiStatusSchema,
  affectedAlignments: z.array(alignmentOutputSchema),
  affectedStrategyNodeIds: z.array(z.string()),
  affectedHierarchyEdges: z.array(kpiHierarchyEdgeOutputSchema),
  strategyNodesVerified: z.boolean(),
}).strict();

const keyResultOutputSchema = z.object({
  id: z.string().uuid(),
  okrId: z.string().uuid(),
  type: keyResultTypeSchema,
  targetValue: z.number(),
  unit: z.string(),
  currentValue: z.number().nullable(),
  progressPercent: z.number().nullable(),
  progressUpdatedAt: z.date().nullable(),
}).strict();

const okrOutputSchema = z.object({
  id: z.string().uuid(),
  objectiveNodeId: z.string(),
  nameEn: z.string(),
  nameAr: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  keyResults: z.array(keyResultOutputSchema),
}).strict();

const registryCreateOkrInputSchema = z.object({
  objectiveNodeId: strategyNodeIdSchema,
  nameEn: shortTextSchema,
  nameAr: shortTextSchema,
  keyResults: z.array(z.object({
    type: keyResultTypeSchema,
    targetValue: z.number().finite(),
    unit: z.string().trim().min(1).max(50),
  }).strict()).min(1).max(20),
}).strict();

const registryUpdateProgressInputSchema = z.object({
  keyResultId: z.string().uuid(),
  currentValue: z.number().finite(),
}).strict();

const registrySetAlignmentInputSchema = z.object({
  kpiDefinitionId: z.string().uuid(),
  // An empty list is meaningful: it clears every alignment.
  alignments: z.array(z.object({
    strategyNodeId: strategyNodeIdSchema,
    alignmentType: alignmentTypeSchema,
  }).strict()).max(100),
}).strict();

const registrySetRollupInputSchema = z.object({
  parentKpiId: z.string().uuid(),
  childKpiId: z.string().uuid(),
  rollupMethodRuleId: z.string().uuid(),
}).strict();

// ---------------------------------------------------------------------------
// Performance schemas
// ---------------------------------------------------------------------------

const measurementSourceSchema = z.enum(["manual", "feed", "template"]);
const captureSessionStateSchema = z.enum(["draft", "submitted", "recalled"]);

const measurementOutputSchema = z.object({
  id: z.string().uuid(),
  kpiVersionId: z.string().uuid(),
  scopeNodeId: z.string(),
  period: z.string(),
  value: z.number(),
  source: measurementSourceSchema,
  locked: z.boolean(),
  supersedesId: z.string().uuid().nullable(),
  submittedBy: z.string().uuid().nullable(),
  evidenceRef: z.string().nullable(),
  createdAt: z.date(),
}).strict();

const targetSeriesOutputSchema = z.object({
  id: z.string().uuid(),
  kpiVersionId: z.string().uuid(),
  scopeNodeId: z.string(),
  period: z.string(),
  targetValue: z.number(),
  planVersionId: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
}).strict();

const commentaryOutputSchema = z.object({
  id: z.string().uuid(),
  kpiVersionId: z.string().uuid(),
  scopeNodeId: z.string(),
  period: z.string(),
  authorId: z.string().uuid(),
  bodyEn: z.string().nullable(),
  bodyAr: z.string().nullable(),
  createdAt: z.date(),
}).strict();

const statusResultOutputSchema = z.object({
  id: z.string().uuid(),
  kpiVersionId: z.string().uuid(),
  scopeNodeId: z.string(),
  period: z.string(),
  status: z.string(),
  computedAt: z.date(),
  ruleVersionUsed: z.string().uuid(),
  createdAt: z.date(),
}).strict();

const rollupResultOutputSchema = z.object({
  id: z.string().uuid(),
  parentKpiId: z.string().uuid(),
  scopeNodeId: z.string(),
  period: z.string(),
  aggregatedValue: z.number(),
  method: z.string(),
  createdAt: z.date(),
}).strict();

const captureSessionOutputSchema = z.object({
  id: z.string().uuid(),
  kpiVersionId: z.string().uuid(),
  scopeNodeId: z.string(),
  period: z.string(),
  state: captureSessionStateSchema,
  ownerId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
}).strict();

const performanceCreateMeasurementInputSchema = z.object({
  kpiVersionId: z.string().uuid(),
  scopeNodeId: z.string(),
  period: z.string(),
  value: z.number().finite(),
  source: measurementSourceSchema,
  locked: z.boolean().optional(),
  supersedesId: z.string().uuid().nullish(),
  submittedBy: z.string().uuid().nullish(),
  evidenceRef: z.string().nullish(),
}).strict();

const performanceListMeasurementsInputSchema = z.object({
  kpiVersionId: z.string().uuid().optional(),
  scopeNodeId: z.string().optional(),
  period: z.string().optional(),
  asOf: z.coerce.date().optional(),
  includeSuperseded: z.boolean().optional(),
}).strict();

const performanceGetCurrentMeasurementInputSchema = z.object({
  kpiVersionId: z.string().uuid(),
  scopeNodeId: z.string(),
  period: z.string(),
}).strict();

const performanceGetMeasurementAsOfInputSchema = z.object({
  kpiVersionId: z.string().uuid(),
  scopeNodeId: z.string(),
  period: z.string(),
  asOf: z.coerce.date(),
}).strict();

const performanceAddTargetSeriesInputSchema = z.object({
  kpiVersionId: z.string().uuid(),
  scopeNodeId: z.string(),
  period: z.string(),
  targetValue: z.number().finite(),
  planVersionId: z.string().uuid().nullish(),
}).strict();

const performanceAddCommentaryInputSchema = z.object({
  kpiVersionId: z.string().uuid(),
  scopeNodeId: z.string(),
  period: z.string(),
  authorId: z.string().uuid(),
  bodyEn: z.string().nullish(),
  bodyAr: z.string().nullish(),
}).strict();

const performanceStartCaptureSessionInputSchema = z.object({
  kpiVersionId: z.string().uuid(),
  scopeNodeId: z.string(),
  period: z.string(),
  ownerId: z.string().uuid(),
}).strict();

const performanceSubmitCaptureSessionInputSchema = z.object({
  sessionId: z.string().uuid(),
  measurementValue: z.number().finite(),
  evidenceRef: z.string().nullish(),
}).strict();

const performanceRecallCaptureSessionInputSchema = z.object({
  sessionId: z.string().uuid(),
}).strict();

const performanceGetStatusResultInputSchema = z.object({
  kpiVersionId: z.string().uuid(),
  scopeNodeId: z.string(),
  period: z.string(),
}).strict();

const performanceGetRollupResultInputSchema = z.object({
  parentKpiId: z.string().uuid(),
  scopeNodeId: z.string(),
  period: z.string(),
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
  registry: router({
    kpi: router({
      createDraft: registryAuthor()
        .input(registryCreateDraftInputSchema)
        .output(kpiWithVersionOutputSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return await ctx.registry.kpi.createDraft(input);
          } catch (error) {
            throw toRegistryError(
              error,
              "Unable to create KPI draft",
            );
          }
        }),

      publishVersion: registryPublisher()
        .input(registryPublishVersionInputSchema)
        .output(kpiWithVersionOutputSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return await ctx.registry.kpi.publishVersion(input);
          } catch (error) {
            throw toRegistryError(
              error,
              "Unable to publish KPI version",
            );
          }
        }),

      retire: registryPublisher()
        .input(registryKpiIdInputSchema)
        .output(kpiDefinitionOutputSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return await ctx.registry.kpi.retire(input.kpiDefinitionId);
          } catch (error) {
            throw toRegistryError(error, "Unable to retire KPI");
          }
        }),

      findSimilar: protectedProcedure
        .input(registryFindSimilarInputSchema)
        .output(z.array(kpiSimilarityMatchOutputSchema))
        .query(({ ctx, input }) => ctx.registry.kpi.findSimilar(input)),

      retirementImpact: protectedProcedure
        .input(registryKpiIdInputSchema)
        .output(retirementImpactOutputSchema)
        .query(async ({ ctx, input }) => {
          try {
            return await ctx.registry.kpi.retirementImpact(
              input.kpiDefinitionId,
            );
          } catch (error) {
            throw toRegistryError(
              error,
              "Unable to assess retirement impact",
            );
          }
        }),

      listVersions: protectedProcedure
        .input(registryKpiIdInputSchema)
        .output(z.array(kpiVersionOutputSchema))
        .query(({ ctx, input }) =>
          ctx.registry.kpi.listVersions(input.kpiDefinitionId),
        ),
    }),

    okr: router({
      create: registryAuthor()
        .input(registryCreateOkrInputSchema)
        .output(okrOutputSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return await ctx.registry.okr.create(input);
          } catch (error) {
            throw toRegistryError(error, "Unable to create OKR");
          }
        }),
    }),

    keyResult: router({
      updateProgress: registryAuthor()
        .input(registryUpdateProgressInputSchema)
        .output(keyResultOutputSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return await ctx.registry.okr.updateProgress(input);
          } catch (error) {
            throw toRegistryError(
              error,
              "Unable to update key result progress",
            );
          }
        }),
    }),

    alignment: router({
      set: registryAuthor()
        .input(registrySetAlignmentInputSchema)
        .output(z.array(alignmentOutputSchema))
        .mutation(async ({ ctx, input }) => {
          try {
            return await ctx.registry.alignment.set(input);
          } catch (error) {
            throw toRegistryError(error, "Unable to set alignments");
          }
        }),
    }),

    hierarchy: router({
      setRollup: registryAuthor()
        .input(registrySetRollupInputSchema)
        .output(kpiHierarchyEdgeOutputSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return await ctx.registry.hierarchy.setRollup(input);
          } catch (error) {
            throw toRegistryError(
              error,
              "Unable to set rollup method",
            );
          }
        }),
    }),
  }),

  performance: router({
    capture: router({
      startSession: protectedProcedure
        .input(performanceStartCaptureSessionInputSchema)
        .output(z.object({ sessionId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
          try {
            return await ctx.performance.startCaptureSession({
              ...input,
              ownerId: ctx.session.user.id,
            });
          } catch (error) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Unable to start capture session",
            });
          }
        }),

      submit: protectedProcedure
        .input(performanceSubmitCaptureSessionInputSchema)
        .output(measurementOutputSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return await ctx.performance.submitCaptureSession(input);
          } catch (error) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Unable to submit capture session",
            });
          }
        }),

      recall: protectedProcedure
        .input(performanceRecallCaptureSessionInputSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return await ctx.performance.recallCaptureSession(input);
          } catch (error) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Unable to recall capture session",
            });
          }
        }),
    }),

    measurement: router({
      list: protectedProcedure
        .input(performanceListMeasurementsInputSchema)
        .output(z.array(measurementOutputSchema))
        .query(({ ctx, input }) => ctx.performance.listMeasurements(input)),

      getCurrent: protectedProcedure
        .input(performanceGetCurrentMeasurementInputSchema)
        .output(measurementOutputSchema.nullable())
        .query(({ ctx, input }) => ctx.performance.getCurrentMeasurement(input)),

      getAsOf: protectedProcedure
        .input(performanceGetMeasurementAsOfInputSchema)
        .output(measurementOutputSchema.nullable())
        .query(({ ctx, input }) => ctx.performance.getMeasurementAsOf(input)),
    }),

    commentary: router({
      add: protectedProcedure
        .input(performanceAddCommentaryInputSchema)
        .output(commentaryOutputSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return await ctx.performance.addCommentary({
              ...input,
              authorId: ctx.session.user.id,
            });
          } catch (error) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Unable to add commentary",
            });
          }
        }),
    }),

    status: router({
      get: protectedProcedure
        .input(performanceGetStatusResultInputSchema)
        .output(statusResultOutputSchema.nullable())
        .query(({ ctx, input }) => ctx.performance.getStatusResult(input)),
    }),

    rollup: router({
      get: protectedProcedure
        .input(performanceGetRollupResultInputSchema)
        .output(rollupResultOutputSchema.nullable())
        .query(({ ctx, input }) => ctx.performance.getRollupResult(input)),
    }),

    targetSeries: router({
      add: registryAuthor()
        .input(performanceAddTargetSeriesInputSchema)
        .output(targetSeriesOutputSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return await ctx.performance.addTargetSeries(input);
          } catch (error) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Unable to add target series",
            });
          }
        }),
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
