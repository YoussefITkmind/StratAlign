import { describe, expect, it } from "vitest";

import { UnavailableApprovalGateway } from "../../src/modules/registry/gateways/approval.gateway";
import { UnverifiedStrategyNodeGateway } from "../../src/modules/registry/gateways/strategy-node.gateway";
import { RegistryApprovalError } from "../../src/modules/registry/registry.errors";

/**
 * These adapters stand in for modules this repository does not contain. Their
 * failure direction is the whole point, so it is asserted directly rather than
 * left implicit in the integration suite.
 */
describe("registry integration seams", () => {
  describe("UnavailableApprovalGateway", () => {
    it("refuses every approval check", async () => {
      const gateway = new UnavailableApprovalGateway();

      await expect(
        gateway.assertApproved({
          approvalCaseId: "any-case",
          subjectType: "KpiDefinition",
          subjectId: "any-kpi",
        }),
      ).rejects.toBeInstanceOf(RegistryApprovalError);
    });

    it("names the missing dependency instead of failing opaquely", async () => {
      const gateway = new UnavailableApprovalGateway();

      await expect(
        gateway.assertApproved({
          approvalCaseId: "case-42",
          subjectType: "KpiDefinition",
          subjectId: "kpi-1",
        }),
      ).rejects.toThrow(/workflow module is not available/i);
    });
  });

  describe("UnverifiedStrategyNodeGateway", () => {
    it("accepts node ids it cannot check", async () => {
      const gateway = new UnverifiedStrategyNodeGateway();

      await expect(
        gateway.assertNodesExist(["node-1", "node-2"]),
      ).resolves.toBeUndefined();
    });

    it("never claims to have verified anything", () => {
      expect(new UnverifiedStrategyNodeGateway().canVerify).toBe(false);
    });
  });
});
