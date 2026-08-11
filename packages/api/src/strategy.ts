import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { requireRole, router } from "./index";

export interface StrategyServiceContract {
  createPlanVersion(name: string): Promise<unknown>;
  createNode(input: { type: "corporate_strategy"|"theme"|"objective"|"strategic_play"|"portfolio"|"area_of_focus"; nameEn: string; nameAr: string; planVersionId: string; actorUserId: string; approvalCaseId?: string }): Promise<unknown>;
  updateNode(input: { nodeId: string; nameEn?: string; nameAr?: string; actorUserId: string; approvalCaseId?: string }): Promise<unknown>;
  retireNode(input: { nodeId: string; actorUserId: string; approvalCaseId?: string }): Promise<unknown>;
  linkEdge(input: { fromNodeId: string; toNodeId: string; edgeType: "contains"|"executed_by"|"belongs_to_portfolio"|"aligns_to"; planVersionId: string; actorUserId: string; approvalCaseId?: string }): Promise<unknown>;
  unlinkEdge(input: { edgeId: string; actorUserId: string; approvalCaseId?: string }): Promise<unknown>;
  assignOwner(input: { nodeId: string; ownerUserId: string; assignedBy: string }): Promise<unknown>;
  openPlanVersion(planVersionId: string, opensAt?: Date): Promise<unknown>;
  closePlanVersion(planVersionId: string, closesAt?: Date): Promise<unknown>;
  carryForward(sourcePlanVersionId: string, newName: string, actorUserId: string): Promise<unknown>;
}

declare module "./index" {
  interface TrpcContext { strategy: StrategyServiceContract; }
}

const id = z.string().uuid();
const approval = z.object({ approvalCaseId: id.optional() });
const admin = () => requireRole("seo_administrator");
const fail = (error: unknown): never => {
  throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Strategy operation failed" });
};

export const strategyRouter = router({
  node: router({
    create: admin().input(z.object({
      type: z.enum(["corporate_strategy","theme","objective","strategic_play","portfolio","area_of_focus"]),
      nameEn: z.string().trim().min(1).max(300), nameAr: z.string().trim().min(1).max(300), planVersionId: id,
      approvalCaseId: id.optional(),
    }).strict()).mutation(async ({ ctx, input }) => {
      try { return await ctx.strategy.createNode({ ...input, actorUserId: ctx.session!.user.id }); } catch (e) { return fail(e); }
    }),
    update: admin().input(z.object({ nodeId: id, nameEn: z.string().trim().min(1).max(300).optional(), nameAr: z.string().trim().min(1).max(300).optional(), approvalCaseId: id.optional() }).strict())
      .mutation(async ({ ctx, input }) => { try { return await ctx.strategy.updateNode({ ...input, actorUserId: ctx.session!.user.id }); } catch (e) { return fail(e); } }),
    retire: admin().input(z.object({ nodeId: id, approvalCaseId: id.optional() }).strict())
      .mutation(async ({ ctx, input }) => { try { return await ctx.strategy.retireNode({ ...input, actorUserId: ctx.session!.user.id }); } catch (e) { return fail(e); } }),
  }),
  edge: router({
    link: admin().input(z.object({ fromNodeId: id, toNodeId: id, edgeType: z.enum(["contains","executed_by","belongs_to_portfolio","aligns_to"]), planVersionId: id, approvalCaseId: id.optional() }).strict())
      .mutation(async ({ ctx, input }) => { try { return await ctx.strategy.linkEdge({ ...input, actorUserId: ctx.session!.user.id }); } catch (e) { return fail(e); } }),
    unlink: admin().input(z.object({ edgeId: id, approvalCaseId: id.optional() }).strict())
      .mutation(async ({ ctx, input }) => { try { return await ctx.strategy.unlinkEdge({ ...input, actorUserId: ctx.session!.user.id }); } catch (e) { return fail(e); } }),
  }),
  owner: router({
    assign: admin().input(z.object({ nodeId: id, ownerUserId: z.string().min(1) }).strict())
      .mutation(async ({ ctx, input }) => { try { return await ctx.strategy.assignOwner({ ...input, assignedBy: ctx.session!.user.id }); } catch (e) { return fail(e); } }),
  }),
  planVersion: router({
    create: admin().input(z.object({ name: z.string().trim().min(1).max(300) }).strict())
      .mutation(async ({ ctx, input }) => { try { return await ctx.strategy.createPlanVersion(input.name); } catch (e) { return fail(e); } }),
    open: admin().input(z.object({ planVersionId: id, opensAt: z.coerce.date().optional() }).strict())
      .mutation(async ({ ctx, input }) => { try { return await ctx.strategy.openPlanVersion(input.planVersionId, input.opensAt); } catch (e) { return fail(e); } }),
    close: admin().input(z.object({ planVersionId: id, closesAt: z.coerce.date().optional() }).strict())
      .mutation(async ({ ctx, input }) => { try { return await ctx.strategy.closePlanVersion(input.planVersionId, input.closesAt); } catch (e) { return fail(e); } }),
    carryForward: admin().input(z.object({ sourcePlanVersionId: id, name: z.string().trim().min(1).max(300) }).strict())
      .mutation(async ({ ctx, input }) => { try { return await ctx.strategy.carryForward(input.sourcePlanVersionId, input.name, ctx.session!.user.id); } catch (e) { return fail(e); } }),
  }),
});
