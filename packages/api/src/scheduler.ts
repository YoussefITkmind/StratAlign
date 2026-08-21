import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./index";

const cadenceStatuses = ["PENDING", "OPEN", "CLOSING", "CLOSED", "REVIEW_DUE", "COMPLETED", "SKIPPED", "FAILED"] as const;

export interface CadenceInstanceView {
  id: string;
  cadenceDefinitionId: string;
  sequence: number;
  occurrenceAt: Date;
  periodKey: string | null;
  periodStartsAt: Date | null;
  periodEndsAt: Date | null;
  windowOpensAt: Date;
  windowClosingAt: Date;
  windowClosesAt: Date;
  reviewDueAt: Date;
  status: (typeof cadenceStatuses)[number];
  nextTransitionAt: Date | null;
  payloadSnapshot: unknown;
  skipReason: string | null;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  cadenceDefinition: { id: string; key: string; name: string; subjectType: string; subjectId: string };
}

export interface SchedulerReadServiceContract {
  listUpcomingReviews(limit?: number): Promise<Array<{
    id: string;
    cadenceDefinitionId: string;
    name: string;
    subjectType: string;
    subjectId: string;
    periodKey: string | null;
    status: string;
    reviewDueAt: Date;
  }>>;
  listInstances(input: {
    from: Date;
    to: Date;
    statuses?: Array<(typeof cadenceStatuses)[number]>;
    cadenceDefinitionId?: string;
  }): Promise<CadenceInstanceView[]>;
  getInstance(instanceId: string): Promise<CadenceInstanceView | null>;
}

declare module "./index" {
  interface TrpcContext {
    schedulerRead?: SchedulerReadServiceContract;
  }
}

export const schedulerRouter = router({
  upcomingReviews: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.schedulerRead) throw new Error("Scheduler read service unavailable");
    return ctx.schedulerRead.listUpcomingReviews(10);
  }),
  instances: protectedProcedure
    .input(z.object({
      from: z.coerce.date(),
      to: z.coerce.date(),
      statuses: z.array(z.enum(cadenceStatuses)).min(1).optional(),
      cadenceDefinitionId: z.string().uuid().optional(),
    }).strict().refine((value) => value.from < value.to, { message: "from must be before to" }))
    .query(async ({ ctx, input }) => {
      if (!ctx.schedulerRead) throw new Error("Scheduler read service unavailable");
      return ctx.schedulerRead.listInstances(input);
    }),
  instance: protectedProcedure
    .input(z.object({ instanceId: z.string().uuid() }).strict())
    .query(async ({ ctx, input }) => {
      if (!ctx.schedulerRead) throw new Error("Scheduler read service unavailable");
      const instance = await ctx.schedulerRead.getInstance(input.instanceId);
      if (!instance) throw new TRPCError({ code: "NOT_FOUND", message: "Cadence instance not found" });
      return instance;
    }),
});
