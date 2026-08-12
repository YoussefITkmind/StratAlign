import {
  RegistryApprovalError,
} from "../registry.errors";

export interface ApprovalGateway {
  /**
   * Resolves only when the referenced approval case is
   * APPROVED and governs the exact requested subject.
   *
   * Implementations must fail closed.
   */
  assertApproved(
    input: ApprovalCheck,
  ): Promise<void>;
}

export interface ApprovalCheck {
  approvalCaseId: string;
  subjectType: string;
  subjectId: string;
}

/**
 * Minimal structural contract exposed by Governance.
 *
 * Keeping Registry dependent on this small port avoids
 * coupling the Registry module to Governance internals.
 */
export interface GovernanceApprovalVerifier {
  assertApproved(input: {
    approvalCaseId: string;
    entityType: string;
    entityId: string;
  }): Promise<void>;
}

/**
 * Production adapter from Registry publication checks to
 * the Governance ApprovalCase store.
 *
 * Governance owns the approval state and verifies:
 *
 *   - the ApprovalCase exists
 *   - its state is APPROVED
 *   - entityType matches
 *   - entityId matches
 *
 * Any failure is translated into the Registry domain's
 * fail-closed approval error.
 */
export class GovernanceApprovalGateway
  implements ApprovalGateway
{
  constructor(
    private readonly governance:
      GovernanceApprovalVerifier,
  ) {}

  async assertApproved(
    input: ApprovalCheck,
  ): Promise<void> {
    try {
      await this.governance.assertApproved({
        approvalCaseId:
          input.approvalCaseId,

        entityType:
          input.subjectType,

        entityId:
          input.subjectId,
      });
    } catch {
      throw new RegistryApprovalError(
        `Approval case ${input.approvalCaseId} is not approved ` +
          `for ${input.subjectType} ${input.subjectId}`,
      );
    }
  }
}
