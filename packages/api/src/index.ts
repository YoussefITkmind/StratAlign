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
  register(email: string, password: string, displayName: string): Promise<AuthenticatedUser>;
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
  | "project"
  | "theme";

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

export interface KpiThresholdRuleBindingOutput {
  id: string;
  kpiVersionId: string;
  thresholdRuleId: string;
  ruleKey: string;
  ruleVersion: number;
  createdAt: Date;
  createdBy: string;
  supersedesBindingId: string | null;
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
  titleEn: string | null;
  titleAr: string | null;
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
  list(): Promise<KpiWithVersionOutput[]>;
  getById(kpiDefinitionId: string): Promise<KpiWithVersionOutput | null>;
  bindThresholdRule(input: {
    kpiVersionId: string;
    thresholdRuleId: string;
    actorUserId: string;
  }): Promise<KpiThresholdRuleBindingOutput>;
  getThresholdRuleBinding(
    kpiVersionId: string,
  ): Promise<KpiThresholdRuleBindingOutput | null>;
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
      titleEn?: string | null;
      titleAr?: string | null;
    }>;
  }): Promise<OkrOutput>;

  updateProgress(input: {
    keyResultId: string;
    currentValue: number;
  }): Promise<KeyResultOutput>;
  list(): Promise<OkrOutput[]>;
  getById(okrId: string): Promise<OkrOutput | null>;
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
  getKpiDetail(kpiDefinitionId: string): Promise<{
    definition: { id: string; status: string; retiredAt: Date | null };
    version: { id: string; version: number; nameEn: string; nameAr: string; descriptionEn: string | null; descriptionAr: string | null; unit: string; polarity: string; frequency: string; dataSourceType: string; ownerUserId: string; ownerName: string; publishedAt: Date | null };
    scopeNodeId: string | null;
    period: string | null;
    targets: Array<{ id: string; scopeNodeId: string; period: string; targetValue: number; planVersionId: string }>;
    measurements: Array<{ id: string; scopeNodeId: string; period: string; value: number; createdAt: Date }>;
    statuses: Array<{ id: string; scopeNodeId: string; period: string; status: string; computedAt: Date; ruleVersionUsed: string }>;
    rollups: Array<{ id: string; scopeNodeId: string; period: string; aggregatedValue: number | null; method: string }>;
    contributors: Array<{ definitionId: string; versionId: string; nameEn: string; unit: string; value: number | null; status: string | null; rollupRuleId: string; rollupRuleDocument: unknown }>;
    commentary: Array<{ id: string; bodyEn: string | null; bodyAr: string | null; authorId: string; authorName: string; createdAt: Date; period: string; scopeNodeId: string }>;
    alignments: Array<{ id: string; alignmentType: string; strategyNodeId: string; strategyNodeName: string; strategyNodeType: string }>;
    thresholdBinding: { id: string; thresholdRuleId: string; ruleKey: string; ruleVersion: number; ruleDocument: unknown } | null;
  } | null>;
  listCaptureTasks(ownerId: string): Promise<Array<{ id: string; kpiVersionId: string; kpiName: string; unit: string; scopeNodeId: string; period: string; dueAt: Date; cadenceState: string; session: (CaptureSessionOutput & { draftValue?: unknown; draftEvidenceRef?: string | null }) | null }>>;
  getCaptureSession(sessionId: string): Promise<(CaptureSessionOutput & { draftValue?: unknown; draftEvidenceRef?: string | null }) | null>;
  saveCaptureDraft(sessionId: string, ownerId: string, value: number, evidenceRef?: string | null): Promise<CaptureSessionOutput & { draftValue?: unknown; draftEvidenceRef?: string | null }>;
  captureHistory(kpiVersionId: string, scopeNodeId: string): Promise<MeasurementOutput[]>;
  captureTemplate(format: "csv" | "xlsx", period: string, priorValue: number | null): Buffer;
  validateCaptureTemplate(bytes: Buffer, format: "csv" | "xlsx", expectedPeriod: string, history: number[]): Array<{ row: number; period: string; value: number | null; outcome: "accepted" | "rejected" | "warning"; reason?: string }>;
  uploadCaptureEvidence(sessionId: string, fileName: string, contentType: string, bytes: Buffer): Promise<string>;
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

  listCommentary(input: {
    kpiVersionId: string;
    scopeNodeId: string;
    period: string;
    limit: number;
  }): Promise<CommentaryOutput[]>;

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

export interface GovernanceApprovalReferenceInput {
  approvalCaseId: string;
  entityType: string;
  entityId: string;
}

export type GovernanceApprovalState =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "CHANGES_REQUESTED";

export interface GovernanceCaseOutput {
  id: string;
  workflowDefinitionId: string;
  entityType: string;
  entityId: string;
  submittedBy: string;
  approvalParticipantId: string | null;
  approvalSlaMs: number;
  currentState: GovernanceApprovalState;
  xstateContextSnapshot: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface GovernanceDecisionLogOutput {
  id: string;
  caseId: string;
  entityType: string;
  entityId: string;
  decision: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
  decidedBy: string;
  decidedAt: Date;
  rationale: string | null;
}

export type GovernanceDecisionInput =
  | {
      type: "APPROVE";
      actorUserId: string;
      rationale?: string;
    }
  | {
      type: "REJECT";
      actorUserId: string;
      rationale?: string;
    }
  | {
      type: "REQUEST_CHANGES";
      actorUserId: string;
      rationale?: string;
    };

export interface GovernanceServiceContract {
  submitCase(input: {
    entityType: string;
    entityId: string;
    submittedBy: string;
    approvalParticipantId: string;
    proposedChange: {
      before: unknown;
      after: unknown;
      impactSummary?: unknown;
    };
  }): Promise<GovernanceCaseOutput>;

  assertApproved(
    input: GovernanceApprovalReferenceInput,
  ): Promise<void>;

  myPendingApprovals(
    viewerUserId: string,
  ): Promise<GovernanceCaseOutput[]>;

  getCase(
    caseId: string,
  ): Promise<GovernanceCaseOutput>;

  getLatestCaseForEntity(
    entityType: string,
    entityId: string,
  ): Promise<GovernanceCaseOutput | null>;

  transition(input: {
    caseId: string;
    event: GovernanceDecisionInput;
  }): Promise<GovernanceCaseOutput>;

  listDecisions(
    limit?: number,
  ): Promise<GovernanceDecisionLogOutput[]>;
}

export interface GovernanceEscalationOutput {
  id: string;
  caseId: string;
  participant: string;
  deadline: Date;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
  createdAt: Date;
}

export interface GovernanceEscalationServiceContract {
  listForParticipant(
    participantUserId: string,
    includeAcknowledged?: boolean,
  ): Promise<GovernanceEscalationListOutput[]>;
  acknowledge(
    escalationId: string,
    actingUserId: string,
  ): Promise<GovernanceEscalationOutput>;
}

export interface GovernanceEscalationListOutput extends GovernanceEscalationOutput {
  approvalCase: {
    id: string;
    entityType: string;
    entityId: string;
    currentState: string;
    approvalSlaMs: number;
  };
  participantUser: { id: string; displayName: string | null; email: string };
  acknowledger: { id: string; displayName: string | null; email: string } | null;
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
  governance: GovernanceServiceContract;
  governanceEscalation: GovernanceEscalationServiceContract;
  audit: AuditServiceContract;
  auditTap: AuditTapServiceContract;
  performance: PerformanceServiceContract;
  registry: RegistryServicesContract;
}

type WorkflowReferenceRequirement = {
  entityType: string;
  entityIdField: string;
  approvalCaseIdField?: string;
};

type ProcedureMeta = {
  actionClass?: StepUpActionClass;
  auditRelevant?: boolean;
  requiresApprovalCase?: WorkflowReferenceRequirement;
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
export const mergeRouters = t.mergeRouters;
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

export const withWorkflowReferenceCheck = middleware(
  async ({
    ctx,
    meta,
    getRawInput,
    next,
  }) => {
    const requirement =
      meta?.requiresApprovalCase;

    if (!requirement) {
      return next({ ctx });
    }

    const rawInput =
      await getRawInput();

    if (
      typeof rawInput !== "object" ||
      rawInput === null ||
      Array.isArray(rawInput)
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Workflow approval reference is required",
      });
    }

    const input =
      rawInput as Record<
        string,
        unknown
      >;

    const approvalCaseIdField =
      requirement.approvalCaseIdField ??
      "approvalCaseId";

    const approvalCaseId =
      input[approvalCaseIdField];

    const entityId =
      input[
        requirement.entityIdField
      ];

    if (
      typeof approvalCaseId !==
        "string" ||
      approvalCaseId.trim().length === 0 ||
      typeof entityId !== "string" ||
      entityId.trim().length === 0
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Workflow approval reference is required",
      });
    }

    try {
      await ctx.governance.assertApproved({
        approvalCaseId,
        entityType:
          requirement.entityType,
        entityId,
      });
    } catch {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "This operation requires an approved workflow case for the same entity",
      });
    }

    return next({ ctx });
  },
);

export const withAuditTap = middleware(
  async ({ ctx, meta, path, type, next }) => {
    const result = await next();

    if (!result.ok) {
      return result;
    }

    const auditRelevant = meta?.auditRelevant ?? (type === "mutation");

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

/**
 * `CredentialService.register` raises `EmailAlreadyRegisteredError` with a
 * stable `code`, duck-typed here for the same reason as `isExpectedOidcError`:
 * this package must not depend on backend error classes.
 */
function isEmailAlreadyRegisteredError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    error.code === "EMAIL_ALREADY_REGISTERED";
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

const governanceCaseIdInputSchema = z.object({
  caseId: z.string().uuid(),
}).strict();

const governanceEntityInputSchema = z.object({
  entityType: z.string().trim().min(1).max(150),
  entityId: z.string().trim().min(1).max(200),
}).strict();

const governanceSubmitInputSchema = z.object({
  entityType: z.string().trim().min(1).max(150),
  entityId: z.string().trim().min(1).max(200),
  approvalParticipantId: z.string().uuid(),
  proposedChange: z.object({
    before: z.unknown(),
    after: z.unknown(),
    impactSummary: z.unknown().optional(),
  }).strict(),
}).strict();

const governanceEscalationIdInputSchema = z.object({
  escalationId: z.string().uuid(),
}).strict();

const governanceEscalationOutputSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  participant: z.string().uuid(),
  deadline: z.date(),
  acknowledgedAt: z.date().nullable(),
  acknowledgedBy: z.string().uuid().nullable(),
  createdAt: z.date(),
}).strict();

const governanceEscalationListOutputSchema = governanceEscalationOutputSchema.extend({
  approvalCase: z.object({
    id: z.string().uuid(),
    entityType: z.string(),
    entityId: z.string(),
    currentState: z.string(),
    approvalSlaMs: z.number().int().nonnegative(),
  }).strict(),
  participantUser: z.object({
    id: z.string().uuid(), displayName: z.string().nullable(), email: z.string().email(),
  }).strict(),
  acknowledger: z.object({
    id: z.string().uuid(), displayName: z.string().nullable(), email: z.string().email(),
  }).strict().nullable(),
}).strict();

const governanceDecisionInputSchema = z.object({
  caseId: z.string().uuid(),

  decision: z.enum([
    "approve",
    "reject",
    "request_changes",
  ]),

  rationale: z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .optional(),
}).strict();

const governanceDecisionLogOutputSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  entityType: z.string(),
  entityId: z.string(),
  decision: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]),
  decidedBy: z.string().uuid(),
  decidedAt: z.date(),
  rationale: z.string().nullable(),
}).strict();

const governanceDecisionEvent = {
  approve: "APPROVE",
  reject: "REJECT",
  request_changes: "REQUEST_CHANGES",
} as const;

const GOVERNANCE_API_ERROR_CODES = {
  GOVERNANCE_CASE_NOT_FOUND:
    "NOT_FOUND",

  GOVERNANCE_ILLEGAL_TRANSITION:
    "CONFLICT",

  SEPARATION_OF_DUTIES_VIOLATION:
    "FORBIDDEN",

  GOVERNANCE_APPROVAL_REFERENCE_INVALID:
    "FORBIDDEN",

  GOVERNANCE_ESCALATION_NOT_FOUND:
    "NOT_FOUND",

  GOVERNANCE_ESCALATION_PARTICIPANT_MISMATCH:
    "FORBIDDEN",
} as const satisfies Record<
  string,
  TRPCError["code"]
>;

type GovernanceApiErrorCode =
  keyof typeof GOVERNANCE_API_ERROR_CODES;

function isGovernanceApiError(
  error: unknown,
): error is {
  code: GovernanceApiErrorCode;
  message: string;
} {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (
      error as {
        code: unknown;
      }
    ).code === "string" &&
    (
      error as {
        code: string;
      }
    ).code in
      GOVERNANCE_API_ERROR_CODES
  );
}

async function mapGovernanceErrors<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      !isGovernanceApiError(
        error,
      )
    ) {
      throw new TRPCError({
        code:
          "INTERNAL_SERVER_ERROR",

        message:
          "Unable to complete governance operation",
      });
    }

    throw new TRPCError({
      code:
        GOVERNANCE_API_ERROR_CODES[
          error.code
        ],

      message:
        error.message,
    });
  }
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
  status: z.enum(["draft", "published", "superseded"]),
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
  approvalCaseId: z.string().uuid(),
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

const bulkRowSchema = z.object({ row: z.number().int().positive(), period: z.string(), value: z.number().nullable(), outcome: z.enum(["accepted", "rejected", "warning"]), reason: z.string().optional() }).strict();

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

// ---------------------------------------------------------------------------
// Registry schemas
//
// `strategyNodeId` / `objectiveNodeId` are validated as bounded identifiers
// because the Strategy module owns their external identifier contract.
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
  "theme",
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

const kpiThresholdRuleBindingOutputSchema = z.object({
  id: z.string().uuid(),
  kpiVersionId: z.string().uuid(),
  thresholdRuleId: z.string().uuid(),
  ruleKey: z.string(),
  ruleVersion: z.number().int().positive(),
  createdAt: z.date(),
  createdBy: z.string().uuid(),
  supersedesBindingId: z.string().uuid().nullable(),
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

const registryKpiVersionIdInputSchema = z.object({
  kpiVersionId: z.string().uuid(),
}).strict();

const registryBindThresholdRuleInputSchema = z.object({
  kpiVersionId: z.string().uuid(),
  thresholdRuleId: z.string().uuid(),
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
  // Nullish rather than nullable: key results created before the title columns
  // existed carry no title, and the contract must not force one.
  titleEn: z.string().nullish(),
  titleAr: z.string().nullish(),
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
    titleEn: z.string().trim().min(1).max(300).nullish(),
    titleAr: z.string().trim().min(1).max(300).nullish(),
  }).strict()).min(1).max(20),
}).strict();

const registryOkrIdInputSchema = z.object({
  okrId: z.string().uuid(),
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
  governance: router({
    submit:
      protectedProcedure
        .input(governanceSubmitInputSchema)
        .mutation(({ ctx, input }) =>
          mapGovernanceErrors(() =>
            ctx.governance.submitCase({
              ...input,
              submittedBy: ctx.session.user.id,
            }),
          ),
        ),

    myPendingApprovals:
      protectedProcedure.query(
        ({ ctx }) =>
          mapGovernanceErrors(
            () =>
              ctx.governance
                .myPendingApprovals(
                  ctx.session.user.id,
                ),
          ),
      ),

    getCase:
      protectedProcedure
        .input(
          governanceCaseIdInputSchema,
        )
        .query(
          ({ ctx, input }) =>
            mapGovernanceErrors(
              () =>
                ctx.governance
                  .getCase(
                    input.caseId,
                  ),
            ),
        ),

    getLatestCaseForEntity:
      protectedProcedure
        .input(governanceEntityInputSchema)
        .query(({ ctx, input }) =>
          mapGovernanceErrors(() =>
            ctx.governance.getLatestCaseForEntity(input.entityType, input.entityId),
          ),
        ),

    decide:
      protectedProcedure
        .input(
          governanceDecisionInputSchema,
        )
        .mutation(
          ({ ctx, input }) =>
            mapGovernanceErrors(
              () =>
                ctx.governance
                  .transition({
                    caseId:
                      input.caseId,

                    event: {
                      type:
                        governanceDecisionEvent[
                          input.decision
                        ],

                      actorUserId:
                        ctx.session
                          .user.id,

                      ...(input.rationale
                        ? {
                            rationale:
                              input.rationale,
                          }
                        : {}),
                    },
                  }),
            ),
        ),

    listDecisions:
      protectedProcedure
        .output(
          z.array(governanceDecisionLogOutputSchema),
        )
        .query(
          ({ ctx }) =>
            mapGovernanceErrors(
              () =>
                ctx.governance.listDecisions(),
            ),
        ),

    escalation: router({
      list:
        protectedProcedure
          .input(z.object({ includeAcknowledged: z.boolean().optional().default(true) }).strict())
          .output(z.array(governanceEscalationListOutputSchema))
          .query(({ ctx, input }) =>
            mapGovernanceErrors(() =>
              ctx.governanceEscalation.listForParticipant(
                ctx.session.user.id,
                input.includeAcknowledged,
              ),
            ),
          ),
      acknowledge:
        protectedProcedure
          .input(
            governanceEscalationIdInputSchema,
          )
          .output(
            governanceEscalationOutputSchema,
          )
          .mutation(
            ({ ctx, input }) =>
              mapGovernanceErrors(
                () =>
                  ctx.governanceEscalation
                    .acknowledge(
                      input.escalationId,
                      ctx.session.user.id,
                    ),
              ),
          ),
    }),
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
          throw new TRPCError({ code: "BAD_REQUEST", message: "Unable to create rule draft" });
        }
      }),

    preview: protectedProcedure
      .input(rulesPreviewInputSchema)
      .mutation(({ input }) => {
        const validatedInput = parseRuleInput(input.draftDocument, input.sampleData);
        return evaluateRule(input.draftDocument, validatedInput);
      }),

    publish: requireRole(
      "seo_administrator",
      "strategy_analyst",
    )
      .input(rulesPublishInputSchema)
      .meta({
        requiresApprovalCase: {
          entityType: "RuleDefinition",
          entityIdField: "ruleId",
        },
      })
      .use(withWorkflowReferenceCheck)
      .output(ruleDefinitionOutputSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await ctx.rules.publish(
            input.ruleId,
          );
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Unable to publish rule",
          });
        }
      }),

    evaluate: protectedProcedure
      .input(rulesEvaluateInputSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await ctx.rules.evaluate(input.ruleId, input.input);
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Unable to evaluate rule" });
        }
      }),

    list: protectedProcedure
      .output(z.array(ruleDefinitionOutputSchema))
      .query(({ ctx }) => ctx.rules.list()),

    getVersion: protectedProcedure
      .input(rulesGetVersionInputSchema)
      .output(ruleDefinitionOutputSchema.nullable())
      .query(({ ctx, input }) => ctx.rules.getVersion(input.ruleKey, input.version)),
  }),
  performance: router({
    detail: protectedProcedure
      .input(z.object({ kpiDefinitionId: z.string().uuid() }).strict())
      .query(({ ctx, input }) =>
        mapPerformanceErrors(() => ctx.performance.getKpiDetail(input.kpiDefinitionId))),
    capture: router({
      tasks: requireRole("kpi_owner", "data_steward").query(({ ctx }) => ctx.performance.listCaptureTasks(ctx.session.user.id)),
      getSession: requireRole("kpi_owner", "data_steward").input(z.object({ sessionId: z.string().uuid() }).strict()).query(({ ctx, input }) => ctx.performance.getCaptureSession(input.sessionId)),
      saveDraft: requireRole("kpi_owner", "data_steward").input(z.object({ sessionId: z.string().uuid(), value: z.number().finite(), evidenceRef: evidenceRefSchema.nullish() }).strict()).mutation(({ ctx, input }) => mapPerformanceErrors(() => ctx.performance.saveCaptureDraft(input.sessionId, ctx.session.user.id, input.value, input.evidenceRef))),
      history: requireRole("kpi_owner", "data_steward").input(z.object({ kpiVersionId: boundedIdentifierSchema, scopeNodeId: boundedIdentifierSchema }).strict()).query(({ ctx, input }) => ctx.performance.captureHistory(input.kpiVersionId, input.scopeNodeId)),
      template: requireRole("kpi_owner", "data_steward").input(z.object({ format: z.enum(["csv", "xlsx"]), period: periodSchema, priorValue: z.number().nullable() }).strict()).query(({ ctx, input }) => ({ base64: ctx.performance.captureTemplate(input.format, input.period, input.priorValue).toString("base64"), format: input.format })),
      validateTemplate: requireRole("kpi_owner", "data_steward").input(z.object({ base64: z.string().max(14_000_000), format: z.enum(["csv", "xlsx"]), expectedPeriod: periodSchema, history: z.array(z.number().finite()).max(100) }).strict()).output(z.array(bulkRowSchema)).mutation(({ ctx, input }) => ctx.performance.validateCaptureTemplate(Buffer.from(input.base64, "base64"), input.format, input.expectedPeriod, input.history) as never),
      uploadEvidence: requireRole("kpi_owner", "data_steward").input(z.object({ sessionId: z.string().uuid(), fileName: z.string().min(1).max(255), contentType: z.string().min(1).max(150), base64: z.string().max(14_000_000) }).strict()).mutation(({ ctx, input }) => ctx.performance.uploadCaptureEvidence(input.sessionId, input.fileName, input.contentType, Buffer.from(input.base64, "base64"))),
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
      list: protectedProcedure
        .input(z.object({ kpiVersionId: boundedIdentifierSchema, scopeNodeId: boundedIdentifierSchema, period: periodSchema, limit: z.number().int().min(1).max(100).default(100) }).strict())
        .output(z.array(commentaryOutputSchema))
        .query(({ ctx, input }) => mapPerformanceErrors(() => ctx.performance.listCommentary(input))),
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
  registry: router({
    kpi: router({
      list: protectedProcedure
        .output(z.array(kpiWithVersionOutputSchema))
        .query(({ ctx }) => ctx.registry.kpi.list()),

      get: protectedProcedure
        .input(registryKpiIdInputSchema)
        .output(kpiWithVersionOutputSchema.nullable())
        .query(({ ctx, input }) =>
          ctx.registry.kpi.getById(input.kpiDefinitionId),
        ),

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

      bindThresholdRule: registryAuthor()
        .input(registryBindThresholdRuleInputSchema)
        .output(kpiThresholdRuleBindingOutputSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return await ctx.registry.kpi.bindThresholdRule({
              ...input,
              actorUserId: ctx.session.user.id,
            });
          } catch (error) {
            throw toRegistryError(
              error,
              "Unable to bind threshold rule",
            );
          }
        }),

      getThresholdRuleBinding: protectedProcedure
        .input(registryKpiVersionIdInputSchema)
        .output(kpiThresholdRuleBindingOutputSchema.nullable())
        .query(({ ctx, input }) =>
          ctx.registry.kpi.getThresholdRuleBinding(input.kpiVersionId),
        ),
    }),

    okr: router({
      list: protectedProcedure
        .output(z.array(okrOutputSchema))
        .query(({ ctx }) => ctx.registry.okr.list()),

      get: protectedProcedure
        .input(registryOkrIdInputSchema)
        .output(okrOutputSchema.nullable())
        .query(({ ctx, input }) => ctx.registry.okr.getById(input.okrId)),

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

  auth: router({
    session: protectedProcedure.query(({ ctx }) => ({
      user: ctx.session.user,
      authenticationMethod: ctx.session.authenticationMethod,
    })),
    reconcileOidc: publicProcedure.input(oidcIdTokenInput).output(reconciledOidcUserOutput)
      .mutation(async ({ ctx, input }) => {
        try {
          return await ctx.oidcIdentities.reconcile(input.idToken);
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
    signup: publicProcedure.input(z.object({
      email: z.string().trim().email(),
      password: z.string().min(8).max(256),
      displayName: z.string().trim().min(1).max(200),
    }).strict()).mutation(async ({ ctx, input }) => {
      const limit = await ctx.loginRateLimiter.consume(ctx.clientIp, input.email);
      if (!limit.allowed) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many attempts. Please try again later." });
      }
      try {
        const user = await ctx.credentials.register(input.email, input.password, input.displayName);
        await ctx.loginRateLimiter.reset(ctx.clientIp, input.email);
        return user;
      } catch (error) {
        if (isEmailAlreadyRegisteredError(error)) {
          throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists." });
        }
        console.error("auth.signup failed", error);
        // TEMPORARY DIAGNOSTIC: surfacing the real error message to find a
        // production-only bug that isn't showing up in reachable logs.
        // Revert this to a generic message once the cause is found.
        const detail = error instanceof Error ? error.message : JSON.stringify(error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Unable to create account: ${detail}` });
      }
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

export type { AppRouter } from "./root";
