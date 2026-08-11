/**
 * Failure taxonomy for the KPI / OKR registry.
 *
 * Mirrors `RulesOperationError`: services throw a typed domain error, and the
 * tRPC router translates it into a non-leaking `TRPCError`. Distinct classes
 * exist only where a caller genuinely needs to branch — the router maps
 * approval failures to FORBIDDEN and everything else to BAD_REQUEST.
 */

export class RegistryOperationError extends Error {
  readonly code = "REGISTRY_OPERATION_FAILED";

  constructor(message = "Unable to complete registry operation") {
    super(message);
    this.name = "RegistryOperationError";
  }
}

/**
 * Publication was refused because the governing approval case is missing,
 * not approved, or cannot be resolved. Never thrown for ordinary validation
 * problems, so the router can safely map it to FORBIDDEN.
 */
export class RegistryApprovalError extends Error {
  readonly code = "REGISTRY_APPROVAL_REQUIRED";

  constructor(message = "Publication requires an approved workflow case") {
    super(message);
    this.name = "RegistryApprovalError";
  }
}

export function isRegistryApprovalError(
  error: unknown,
): error is RegistryApprovalError {
  return error instanceof RegistryApprovalError;
}
