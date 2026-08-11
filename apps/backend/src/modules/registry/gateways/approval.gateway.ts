import { RegistryApprovalError } from "../registry.errors";

/**
 * Integration seam onto the Workflow module (Prompt 1.5).
 *
 * The registry must not publish a KPI version unless an ApprovalCase exists
 * and is APPROVED. That case is owned by the Workflow module, which does not
 * exist in this repository yet — there is no `approval_cases` table and the
 * registry deliberately does not create one, because approval cases are not
 * registry data.
 *
 * The dependency is therefore expressed as a port. `KpiRegistryService` calls
 * `assertApproved` and never reasons about approval itself, so wiring the real
 * workflow engine later is a composition-root change only.
 */
export interface ApprovalGateway {
  /**
   * Resolves normally when `approvalCaseId` identifies a case that is
   * APPROVED and governs `subject`. Throws `RegistryApprovalError` otherwise.
   *
   * Implementations must fail closed: an unknown case, an unreachable
   * workflow service, or any ambiguity is a refusal, never an approval.
   */
  assertApproved(input: ApprovalCheck): Promise<void>;
}

export interface ApprovalCheck {
  approvalCaseId: string;
  /** Aggregate the case is expected to govern, e.g. "KpiDefinition". */
  subjectType: string;
  subjectId: string;
}

/**
 * The production adapter until Prompt 1.5 lands.
 *
 * It refuses every publication. That is the correct behaviour for an absent
 * authorisation dependency: the alternative — allowing publication because the
 * checker is missing — would turn a governance control into a no-op the moment
 * it is most likely to be overlooked.
 *
 * Consequence: `registry.kpi.publishVersion` is inert in production until the
 * workflow module is delivered and a real adapter replaces this one in
 * `main.ts`. Draft creation, alignment, hierarchy and search are unaffected.
 *
 * TODO(1.5): replace with an adapter backed by the workflow module's
 * ApprovalCase store, checking status === APPROVED and that the case subject
 * matches the KPI definition being published.
 */
export class UnavailableApprovalGateway implements ApprovalGateway {
  assertApproved(input: ApprovalCheck): Promise<void> {
    return Promise.reject(
      new RegistryApprovalError(
        `Approval case ${input.approvalCaseId} cannot be verified: ` +
          "the workflow module is not available in this deployment",
      ),
    );
  }
}
