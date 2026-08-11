import { describe, expect, it, vi } from "vitest";

import { UnavailableApprovalGateway } from "../../src/modules/registry/gateways/approval.gateway";
import {
  PrismaStrategyNodeGateway,
  UnverifiedStrategyNodeGateway,
} from "../../src/modules/registry/gateways/strategy-node.gateway";
import type { PrismaService } from "../../src/database/prisma.service";
import {
  RegistryApprovalError,
  RegistryOperationError,
} from "../../src/modules/registry/registry.errors";

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

describe("PrismaStrategyNodeGateway", () => {
  it("verifies strategy nodes against the real strategy store", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "node-1" },
      { id: "node-2" },
    ]);

    const prisma = {
      strategyNode: { findMany },
    } as unknown as PrismaService;

    const gateway = new PrismaStrategyNodeGateway(prisma);

    expect(gateway.canVerify).toBe(true);

    await expect(
      gateway.assertNodesExist(["node-1", "node-2"]),
    ).resolves.toBeUndefined();

    expect(findMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ["node-1", "node-2"],
        },
      },
      select: {
        id: true,
      },
    });
  });

  it("accepts an existing OBJECTIVE node for an OKR", async () => {
    const prisma = {
      strategyNode: {
        findUnique: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000001",
          type: "OBJECTIVE",
        }),
      },
    } as unknown as PrismaService;

    const gateway = new PrismaStrategyNodeGateway(prisma);

    await expect(
      gateway.assertObjectiveExists(
        "00000000-0000-4000-8000-000000000001",
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects a non-OBJECTIVE strategy node for an OKR", async () => {
    const prisma = {
      strategyNode: {
        findUnique: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000002",
          type: "THEME",
        }),
      },
    } as unknown as PrismaService;

    const gateway = new PrismaStrategyNodeGateway(prisma);

    await expect(
      gateway.assertObjectiveExists(
        "00000000-0000-4000-8000-000000000002",
      ),
    ).rejects.toBeInstanceOf(RegistryOperationError);
  });

  it("rejects a missing objective node for an OKR", async () => {
    const prisma = {
      strategyNode: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;

    const gateway = new PrismaStrategyNodeGateway(prisma);

    await expect(
      gateway.assertObjectiveExists(
        "00000000-0000-4000-8000-000000000003",
      ),
    ).rejects.toBeInstanceOf(RegistryOperationError);
  });

  it("rejects an unknown strategy node", async () => {
    const prisma = {
      strategyNode: {
        findMany: vi.fn().mockResolvedValue([
          { id: "node-1" },
        ]),
      },
    } as unknown as PrismaService;

    const gateway = new PrismaStrategyNodeGateway(prisma);

    await expect(
      gateway.assertNodesExist(["node-1", "missing-node"]),
    ).rejects.toBeInstanceOf(RegistryOperationError);
  });

  it("does not query the database for an empty node list", async () => {
    const findMany = vi.fn();

    const prisma = {
      strategyNode: { findMany },
    } as unknown as PrismaService;

    const gateway = new PrismaStrategyNodeGateway(prisma);

    await expect(
      gateway.assertNodesExist([]),
    ).resolves.toBeUndefined();

    expect(findMany).not.toHaveBeenCalled();
  });
});
