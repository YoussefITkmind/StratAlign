import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, requireRole, router } from "./index";

export const initiativeStageSchema = z.enum(["design", "pilot", "execute", "scale", "done"]);
export const initiativeStatusSchema = z.enum(["on_track", "at_risk", "off_track"]);
export const confidenceSchema = z.enum(["high", "medium", "low"]);

export const initiativeRegisterInputSchema = z.object({
  nameEn: z.string().trim().min(1).max(300),
  nameAr: z.string().trim().min(1).max(300),
  strategicPlayNodeId: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  stage: initiativeStageSchema,
}).strict();

export const jiraLinkInputSchema = z.object({
  initiativeId: z.string().uuid(),
  jiraProjectKey: z.string().trim().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  jiraProjectUrl: z.string().url().max(2048),
}).strict();

export const milestoneFlagInputSchema = z.object({
  jiraLinkId: z.string().uuid(),
  nameEn: z.string().trim().min(1).max(300),
  nameAr: z.string().trim().min(1).max(300),
  dueDate: z.coerce.date(),
  forecastDate: z.coerce.date().nullable().optional(),
  health: z.enum(["on_time", "at_risk", "late"]),
  source: z.enum(["manual", "jira"]),
}).strict();

export const statusUpdateInputSchema = z.object({
  initiativeId: z.string().uuid(),
  period: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  stage: initiativeStageSchema,
  status: initiativeStatusSchema,
  confidence: confidenceSchema,
  narrativeEn: z.string().trim().max(4000).nullable().optional(),
  narrativeAr: z.string().trim().max(4000).nullable().optional(),
}).strict();

export interface ExecutionServiceContract {
  registerInitiative(input: {
    nameEn: string;
    nameAr: string;
    strategicPlayNodeId: string;
    ownerUserId: string;
    stage: "design" | "pilot" | "execute" | "scale" | "done";
    actorUserId: string;
    actorIsSeoAdministrator: boolean;
  }): Promise<unknown>;
  linkJira(input: { initiativeId: string; jiraProjectKey: string; jiraProjectUrl: string }): Promise<unknown>;
  flagMilestone(input: {
    jiraLinkId: string;
    nameEn: string;
    nameAr: string;
    dueDate: Date;
    forecastDate?: Date | null;
    health: "on_time" | "at_risk" | "late";
    source: "manual" | "jira";
  }): Promise<unknown>;
  updateStatus(input: {
    initiativeId: string;
    period: string;
    stage: "design" | "pilot" | "execute" | "scale" | "done";
    status: "on_track" | "at_risk" | "off_track";
    confidence: "high" | "medium" | "low";
    narrativeEn?: string | null;
    narrativeAr?: string | null;
    submittedBy: string;
  }): Promise<unknown>;
  statusHistory(initiativeId: string): Promise<unknown[]>;
}

declare module "./index" {
  interface TrpcContext {
    execution?: ExecutionServiceContract;
  }
}

function service(ctx: { execution?: ExecutionServiceContract }): ExecutionServiceContract {
  if (!ctx.execution) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Execution service unavailable" });
  }
  return ctx.execution;
}

function mapExecutionError(error: unknown): never {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
  if (code === "EXECUTION_PLAY_OWNERSHIP_REQUIRED") {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this strategic play" });
  }
  if (code === "EXECUTION_INVALID_PLAY" || code === "EXECUTION_INITIATIVE_NOT_FOUND" || code === "EXECUTION_JIRA_LINK_NOT_FOUND") {
    throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid execution request" });
  }
  throw new TRPCError({ code: "BAD_REQUEST", message: "Unable to complete execution operation" });
}

export const executionRouter = router({
  initiative: router({
    register: requireRole("objective_play_owner", "seo_administrator")
      .input(initiativeRegisterInputSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await service(ctx).registerInitiative({
            ...input,
            actorUserId: ctx.session.user.id,
            actorIsSeoAdministrator: ctx.authorizationState.roles.includes("seo_administrator"),
          });
        } catch (error) {
          return mapExecutionError(error);
        }
      }),
    linkJira: requireRole("initiative_owner", "objective_play_owner", "seo_administrator")
      .input(jiraLinkInputSchema)
      .mutation(async ({ ctx, input }) => {
        try { return await service(ctx).linkJira(input); } catch (error) { return mapExecutionError(error); }
      }),
  }),
  milestone: router({
    flag: requireRole("initiative_owner", "objective_play_owner", "seo_administrator")
      .input(milestoneFlagInputSchema)
      .mutation(async ({ ctx, input }) => {
        try { return await service(ctx).flagMilestone(input); } catch (error) { return mapExecutionError(error); }
      }),
  }),
  status: router({
    update: requireRole("initiative_owner", "objective_play_owner", "seo_administrator")
      .input(statusUpdateInputSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await service(ctx).updateStatus({ ...input, submittedBy: ctx.session.user.id });
        } catch (error) {
          return mapExecutionError(error);
        }
      }),
    history: protectedProcedure
      .input(z.object({ initiativeId: z.string().uuid() }).strict())
      .query(async ({ ctx, input }) => {
        try { return await service(ctx).statusHistory(input.initiativeId); } catch (error) { return mapExecutionError(error); }
      }),
  }),
});
