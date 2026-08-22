import { z } from "zod";

export const PLATFORM_ROLES = [
  "executive_viewer",
  "sector_leadership",
  "objective_play_owner",
  "initiative_owner",
  "kpi_owner",
  "data_steward",
  "bi_data_lead",
  "vmo_lead",
  "benefit_owner",
  "strategy_analyst",
  "governance_committee",
  "seo_administrator",
  "platform_administrator",
] as const;

export const platformRoleSchema = z.enum(PLATFORM_ROLES);
export type PlatformRole = z.infer<typeof platformRoleSchema>;

export const ORG_SCOPE_TYPES = ["group", "sector", "function"] as const;
export const orgScopeTypeSchema = z.enum(ORG_SCOPE_TYPES);
export type OrgScopeType = z.infer<typeof orgScopeTypeSchema>;

export const boundedIdentifierSchema = z.string().trim().min(1).max(200);

export const scopeGrantSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  roleName: platformRoleSchema,
  orgScopeType: orgScopeTypeSchema,
  orgScopeId: boundedIdentifierSchema,
  grantedAt: z.date(),
  grantedBy: z.string().uuid(),
}).strict();
export type ScopeGrant = z.infer<typeof scopeGrantSchema>;

export const authorizationScopeSchema = z.object({
  roleName: platformRoleSchema,
  orgScopeType: orgScopeTypeSchema,
  orgScopeId: boundedIdentifierSchema,
  source: z.enum(["scope_grant", "oidc_group"]),
}).strict();
export type AuthorizationScope = z.infer<typeof authorizationScopeSchema>;

export const groupRoleMappingSchema = z.object({
  id: z.string().uuid(),
  groupClaim: boundedIdentifierSchema,
  roleName: platformRoleSchema,
  orgScopeType: orgScopeTypeSchema,
  orgScopeId: boundedIdentifierSchema,
  version: z.number().int().positive(),
  isCurrent: z.boolean(),
  supersedesId: z.string().uuid().nullable(),
  createdAt: z.date(),
  createdBy: z.string().uuid(),
}).strict();
export type GroupRoleMapping = z.infer<typeof groupRoleMappingSchema>;

export const authorizationStateSchema = z.object({
  userId: z.string().uuid(),
  roles: z.array(platformRoleSchema),
  scopeGrants: z.array(authorizationScopeSchema),
  authenticatedAt: z.date(),
}).strict();
export type AuthorizationState = z.infer<typeof authorizationStateSchema>;

export interface ScopePredicate {
  permits(type: OrgScopeType, id: string): boolean;
  readonly grants: readonly AuthorizationScope[];
}

export function createScopePredicate(grants: readonly AuthorizationScope[]): ScopePredicate {
  const keys = new Set(grants.map((grant) => `${grant.orgScopeType}:${grant.orgScopeId}`));
  return {
    grants,
    permits: (type, id) => keys.has(`${type}:${id}`),
  };
}

export const STEP_UP_ACTION_CLASSES = [
  "weighting_change",
  "threshold_change",
  "rule_publication",
  "retirement",
  "role_grant",
  "mapping_change",
  "restricted_export",
] as const;
export const stepUpActionClassSchema = z.enum(STEP_UP_ACTION_CLASSES);
export type StepUpActionClass = z.infer<typeof stepUpActionClassSchema>;

export const stepUpPolicySchema = z.object({
  actionClass: stepUpActionClassSchema,
  requiresStepUp: z.boolean(),
  maxSessionAgeSeconds: z.number().int().positive(),
}).strict();
export type StepUpPolicy = z.infer<typeof stepUpPolicySchema>;

export const safeIamErrorMetadataSchema = z.object({
  stepUpRequired: z.boolean().optional(),
  actionClass: stepUpActionClassSchema.optional(),
}).strict();
export type SafeIamErrorMetadata = z.infer<typeof safeIamErrorMetadataSchema>;

export class StepUpRequiredError extends Error {
  constructor(readonly actionClass: StepUpActionClass) {
    super("Step-up authentication required");
    this.name = "StepUpRequiredError";
  }
}

export class SeparationOfDutiesError extends Error {
  readonly code = "SEPARATION_OF_DUTIES_VIOLATION";
  constructor() {
    super("This action must be performed by a different user.");
    this.name = "SeparationOfDutiesError";
  }
}

export type SeparationOfDutiesDecision =
  | { allowed: true }
  | { allowed: false; error: SeparationOfDutiesError };

export function decideSeparationOfDuties(
  actingUserId: string,
  submittedByUserId: string,
): SeparationOfDutiesDecision {
  return actingUserId === submittedByUserId
    ? { allowed: false, error: new SeparationOfDutiesError() }
    : { allowed: true };
}

export function enforceSeparationOfDuties(
  actingUserId: string,
  submittedByUserId: string,
): void {
  const decision = decideSeparationOfDuties(actingUserId, submittedByUserId);
  if (!decision.allowed) throw decision.error;
}
