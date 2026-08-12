import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/trpc", async () => {
  const { initTRPC, TRPCError } = await import("@trpc/server");
  const t = initTRPC.context<{ session: { user?: { id?: string } } | null; cookieHeader: string | null }>().create();
  return {
    router: t.router,
    authenticatedProcedure: t.procedure.use(({ ctx, next }) => {
      if (!ctx.session?.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
      return next({ ctx });
    }),
  };
});

const calls = vi.hoisted(() => ({ create: vi.fn(), preview: vi.fn(), publish: vi.fn(), list: vi.fn() }));
vi.mock("@/server/backend-registry-client", () => ({
  createBackendRegistryClient: vi.fn(() => ({ rules: {
    create: { mutate: calls.create }, preview: { mutate: calls.preview },
    publish: { mutate: calls.publish }, list: { query: calls.list },
  } })),
  translateBackendRegistryError: (error: unknown) => { throw error; },
}));

import { rulesRouter } from "@/server/routers/rules";

const RULE_ID = "11111111-1111-4111-8111-111111111111";
const CASE_ID = "22222222-2222-4222-8222-222222222222";
const document = {
  ruleType: "threshold_status" as const,
  direction: "higher_is_better" as const,
  bands: [{ label: "On Track", color: "green", comparator: "gte" as const, value: 100 }],
};
const caller = () => rulesRouter.createCaller({
  session: { user: { id: RULE_ID } }, cookieHeader: "session=real",
} as never);

describe("Rule Builder backend proxy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses backend preview and does not evaluate in the frontend", async () => {
    calls.preview.mockResolvedValue({ label: "On Track", color: "green", matchedBandIndex: 0 });
    await expect(caller().preview({ draftDocument: document, sampleData: { value: 101 } }))
      .resolves.toMatchObject({ label: "On Track" });
    expect(calls.preview).toHaveBeenCalledWith({ draftDocument: document, sampleData: { value: 101 } });
  });

  it("persists drafts and reloads them through the backend list", async () => {
    calls.create.mockResolvedValue({ id: RULE_ID, status: "draft", document });
    calls.list.mockResolvedValue([{ id: RULE_ID, status: "draft", document }]);
    await caller().create({ ruleKey: "kpi-threshold:kpi-v1", name: "Threshold", document });
    await expect(caller().list()).resolves.toHaveLength(1);
    expect(calls.create).toHaveBeenCalledOnce();
    expect(calls.list).toHaveBeenCalledOnce();
  });

  it("publishes only by forwarding an approval case id", async () => {
    calls.publish.mockResolvedValue({ id: RULE_ID, status: "published", document });
    await caller().publish({ ruleId: RULE_ID, approvalCaseId: CASE_ID });
    expect(calls.publish).toHaveBeenCalledWith({ ruleId: RULE_ID, approvalCaseId: CASE_ID });
  });
});
