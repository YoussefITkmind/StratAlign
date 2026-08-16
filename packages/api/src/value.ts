import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, requireRole, router } from "./index";

const currencySchema = z.string().trim().regex(/^[A-Za-z]{3}$/);
const amountSchema = z.number().finite();
const stageSchema = z.enum(["design", "pilot", "execute", "scale", "done"]);

export interface ValueServiceContract {
  listTaxonomy(): Promise<unknown[]>;
  createTaxonomy(input: { key: string; nameEn: string; nameAr: string }): Promise<unknown>;
  registerBenefit(input: {
    initiativeId: string;
    categoryId: string;
    driver: string;
    ownerUserId: string;
  }): Promise<unknown>;
  setBaseline(input: {
    benefitId: string;
    amount: number;
    currency: string;
    approvedAt?: Date;
  }): Promise<unknown>;
  recordState(input: {
    benefitId: string;
    state: "planned" | "inflight" | "realized";
    amount: number;
    currency: string;
    period: string;
    source: "manual" | "feed";
    lineageRef?: string | null;
  }): Promise<unknown>;
  transition(input: {
    benefitId: string;
    event: "submit_for_approval" | "approval_granted" | "begin_validation" | "start_tracking" | "close";
    actorUserId: string;
    approvalParticipantId?: string;
    stopReason?: string | null;
  }): Promise<unknown>;
  completeCheckin(input: {
    checkinId: string;
    realizedAmountAtCheckin: number;
    completedAt?: Date;
  }): Promise<unknown>;
  createGateReview(input: {
    initiativeId: string;
    stage: "design" | "pilot" | "execute" | "scale" | "done";
    ruleKey: string;
    criteriaInput: unknown;
    createdBy: string;
  }): Promise<unknown>;
  decideGateReview(input: {
    gateReviewId: string;
    decision: "continue" | "intervene" | "stop";
    decidedBy: string;
    decidedAt?: Date;
  }): Promise<unknown>;
}

declare module "./index" {
  interface TrpcContext {
    value?: ValueServiceContract;
  }
}

function service(ctx: { value?: ValueServiceContract }): ValueServiceContract {
  if (!ctx.value) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Value service unavailable" });
  }
  return ctx.value;
}

function mapValueError(error: unknown): never {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
  if (code === "VALUE_BENEFIT_NOT_FOUND") {
    throw new TRPCError({ code: "NOT_FOUND", message: "Benefit was not found" });
  }
  if (code === "VALUE_GATE_DECISION_FORBIDDEN") {
    throw new TRPCError({ code: "FORBIDDEN", message: error instanceof Error ? error.message : "Gate decision is not allowed" });
  }
  if (code.startsWith("VALUE_")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid value operation" });
  }
  throw new TRPCError({ code: "BAD_REQUEST", message: "Unable to complete value operation", cause: error });
}

export const valueRouter = router({
  taxonomy: router({
    list: protectedProcedure.query(async ({ ctx }) => service(ctx).listTaxonomy()),
    create: requireRole("seo_administrator", "platform_administrator")
      .input(z.object({
        key: z.string().trim().min(2).max(64),
        nameEn: z.string().trim().min(1).max(200),
        nameAr: z.string().trim().min(1).max(200),
      }).strict())
      .mutation(async ({ ctx, input }) => {
        try { return await service(ctx).createTaxonomy(input); } catch (error) { return mapValueError(error); }
      }),
  }),

  benefit: router({
    register: requireRole("initiative_owner", "objective_play_owner", "seo_administrator")
      .input(z.object({
        initiativeId: z.string().uuid(),
        categoryId: z.string().uuid(),
        driver: z.string().trim().min(1).max(4000),
        ownerUserId: z.string().uuid(),
      }).strict())
      .mutation(async ({ ctx, input }) => {
        try { return await service(ctx).registerBenefit(input); } catch (error) { return mapValueError(error); }
      }),
    setBaseline: requireRole("initiative_owner", "objective_play_owner", "seo_administrator")
      .input(z.object({
        benefitId: z.string().uuid(),
        amount: amountSchema,
        currency: currencySchema,
        approvedAt: z.coerce.date().optional(),
      }).strict())
      .mutation(async ({ ctx, input }) => {
        try { return await service(ctx).setBaseline(input); } catch (error) { return mapValueError(error); }
      }),
  }),

  state: router({
    record: requireRole("initiative_owner", "objective_play_owner", "data_steward", "seo_administrator")
      .input(z.object({
        benefitId: z.string().uuid(),
        state: z.enum(["planned", "inflight", "realized"]),
        amount: amountSchema,
        currency: currencySchema,
        period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        source: z.enum(["manual", "feed"]),
        lineageRef: z.string().trim().max(2048).nullable().optional(),
      }).strict())
      .mutation(async ({ ctx, input }) => {
        try { return await service(ctx).recordState(input); } catch (error) { return mapValueError(error); }
      }),
  }),

  workflow: router({
    transition: requireRole("initiative_owner", "objective_play_owner", "seo_administrator")
      .input(z.object({
        benefitId: z.string().uuid(),
        event: z.enum(["submit_for_approval", "approval_granted", "begin_validation", "start_tracking", "close"]),
        approvalParticipantId: z.string().uuid().optional(),
        stopReason: z.string().trim().max(2000).nullable().optional(),
      }).strict())
      .mutation(async ({ ctx, input }) => {
        try {
          return await service(ctx).transition({ ...input, actorUserId: ctx.session.user.id });
        } catch (error) { return mapValueError(error); }
      }),
  }),

  checkin: router({
    complete: requireRole("initiative_owner", "objective_play_owner", "seo_administrator")
      .input(z.object({
        checkinId: z.string().uuid(),
        realizedAmountAtCheckin: amountSchema,
        completedAt: z.coerce.date().optional(),
      }).strict())
      .mutation(async ({ ctx, input }) => {
        try { return await service(ctx).completeCheckin(input); } catch (error) { return mapValueError(error); }
      }),
  }),

  gate: router({
    createReview: requireRole("initiative_owner", "objective_play_owner", "seo_administrator")
      .input(z.object({
        initiativeId: z.string().uuid(),
        stage: stageSchema,
        ruleKey: z.string().trim().min(1).max(200),
        criteriaInput: z.unknown(),
      }).strict())
      .mutation(async ({ ctx, input }) => {
        try { return await service(ctx).createGateReview({ ...input, createdBy: ctx.session.user.id }); }
        catch (error) { return mapValueError(error); }
      }),
    decide: requireRole("seo_administrator", "platform_administrator")
      .input(z.object({
        gateReviewId: z.string().uuid(),
        decision: z.enum(["continue", "intervene", "stop"]),
        decidedAt: z.coerce.date().optional(),
      }).strict())
      .mutation(async ({ ctx, input }) => {
        try { return await service(ctx).decideGateReview({ ...input, decidedBy: ctx.session.user.id }); }
        catch (error) { return mapValueError(error); }
      }),
  }),
});
