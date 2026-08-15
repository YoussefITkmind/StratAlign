import { protectedProcedure, router } from "./index";

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
});
