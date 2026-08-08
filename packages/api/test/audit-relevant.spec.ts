import { describe, expect, it, vi } from "vitest";
import { publicProcedure, router } from "../src/index";

describe("auditRelevant procedure metadata", () => {
  it("audits mutations by default, skips queries by default, and respects overrides", async () => {
    const recordCompletedCall = vi.fn().mockResolvedValue(undefined);

    const testRouter = router({
      defaultMutation: publicProcedure
        .mutation(() => "mutation-ok"),

      defaultQuery: publicProcedure
        .query(() => "query-ok"),

      auditedQuery: publicProcedure
        .meta({ auditRelevant: true })
        .query(() => "audited-query-ok"),

      unauditedMutation: publicProcedure
        .meta({ auditRelevant: false })
        .mutation(() => "unaudited-mutation-ok"),
    });

    const caller = testRouter.createCaller({
      auditTap: {
        recordCompletedCall,
      },
      session: null,
    } as never);

    await caller.defaultMutation();

    expect(recordCompletedCall).toHaveBeenCalledTimes(1);
    expect(recordCompletedCall).toHaveBeenLastCalledWith(
      expect.objectContaining({
        procedurePath: "defaultMutation",
        procedureType: "mutation",
        actorUserId: null,
      }),
    );

    recordCompletedCall.mockClear();

    await caller.defaultQuery();

    expect(recordCompletedCall).not.toHaveBeenCalled();

    await caller.auditedQuery();

    expect(recordCompletedCall).toHaveBeenCalledTimes(1);
    expect(recordCompletedCall).toHaveBeenLastCalledWith(
      expect.objectContaining({
        procedurePath: "auditedQuery",
        procedureType: "query",
        actorUserId: null,
      }),
    );

    recordCompletedCall.mockClear();

    await caller.unauditedMutation();

    expect(recordCompletedCall).not.toHaveBeenCalled();
  });
});
