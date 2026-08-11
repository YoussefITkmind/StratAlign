/**
 * Integration seam onto the Strategy module (Prompts 2.1-2.3).
 *
 * Alignments and OKRs reference strategy nodes by id. Those nodes are owned by
 * the Strategy module, which does not exist in this repository yet, so
 * `registry.alignments.strategy_node_id` and `registry.okrs.objective_node_id`
 * are plain indexed columns with no foreign key — the registry does not invent
 * a strategy_nodes table it has no right to own.
 *
 * Existence checking is expressed as a port so that referential validation can
 * be switched on, without touching registry services, the moment a real
 * adapter is available.
 */
export interface StrategyNodeGateway {
  /**
   * Resolves when every id is an acceptable strategy node reference.
   * Throws `RegistryOperationError` for ids that are known not to exist.
   */
  assertNodesExist(strategyNodeIds: readonly string[]): Promise<void>;

  /**
   * Whether this adapter can actually confirm existence. Callers surface this
   * so a consumer can tell "these nodes are valid" from "nobody checked".
   */
  readonly canVerify: boolean;
}

/**
 * The production adapter until the Strategy module lands.
 *
 * Unlike `UnavailableApprovalGateway`, this one accepts. The asymmetry is
 * deliberate: approval is a security gate, so an absent checker must deny;
 * strategy-node existence is a referential check, and denying it would make
 * alignment permanently unusable and `retirementImpact` vacuous — blocking
 * the module's actual deliverable to guard an invariant nothing can yet
 * violate. It reports `canVerify: false` so callers never mistake acceptance
 * for verification.
 *
 * TODO(2.1-2.3): replace with an adapter that queries the Strategy module's
 * node store and rejects unknown ids.
 */
export class UnverifiedStrategyNodeGateway implements StrategyNodeGateway {
  readonly canVerify = false;

  assertNodesExist(): Promise<void> {
    return Promise.resolve();
  }
}
