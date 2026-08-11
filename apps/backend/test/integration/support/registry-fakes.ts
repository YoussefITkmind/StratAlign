import type {
  ApprovalCheck,
  ApprovalGateway,
} from "../../../src/modules/registry/gateways/approval.gateway";
import type { StrategyNodeGateway } from "../../../src/modules/registry/gateways/strategy-node.gateway";
import { RegistryApprovalError } from "../../../src/modules/registry/registry.errors";

/**
 * In-memory stand-in for the Workflow module (Prompt 1.5).
 *
 * Exists so the publish gate can be exercised from both sides without this
 * repository inventing an ApprovalCase table. It refuses by default: a test
 * must approve a case explicitly, so no test can pass by forgetting to.
 */
export class FakeApprovalGateway implements ApprovalGateway {
  private readonly approved = new Map<string, string>();

  readonly checks: ApprovalCheck[] = [];

  /** Marks a case approved, optionally bound to one subject. */
  approve(approvalCaseId: string, subjectId?: string): void {
    this.approved.set(approvalCaseId, subjectId ?? "*");
  }

  reject(approvalCaseId: string): void {
    this.approved.delete(approvalCaseId);
  }

  assertApproved(input: ApprovalCheck): Promise<void> {
    this.checks.push(input);

    const subject = this.approved.get(input.approvalCaseId);

    if (subject === undefined) {
      return Promise.reject(
        new RegistryApprovalError(
          `Approval case ${input.approvalCaseId} is not approved`,
        ),
      );
    }

    if (subject !== "*" && subject !== input.subjectId) {
      return Promise.reject(
        new RegistryApprovalError(
          `Approval case ${input.approvalCaseId} does not govern ${input.subjectId}`,
        ),
      );
    }

    return Promise.resolve();
  }
}

/**
 * Stand-in for the Strategy module (Prompts 2.1-2.3).
 *
 * Defaults to `canVerify: false`, matching the production adapter. Tests that
 * want to prove the seam works once a real adapter exists register known nodes
 * and construct it with verification enabled.
 */
export class FakeStrategyNodeGateway implements StrategyNodeGateway {
  private readonly knownNodeIds = new Set<string>();

  constructor(readonly canVerify = false) {}

  register(...strategyNodeIds: string[]): void {
    for (const id of strategyNodeIds) {
      this.knownNodeIds.add(id);
    }
  }

  assertNodesExist(strategyNodeIds: readonly string[]): Promise<void> {
    if (!this.canVerify) {
      return Promise.resolve();
    }

    const unknown = strategyNodeIds.filter(
      (id) => !this.knownNodeIds.has(id),
    );

    return unknown.length === 0
      ? Promise.resolve()
      : Promise.reject(
          new Error(`Unknown strategy nodes: ${unknown.join(", ")}`),
        );
  }

  assertObjectiveExists(strategyNodeId: string): Promise<void> {
    return this.assertNodesExist([strategyNodeId]);
  }

}
