import { z } from "zod";
import { protectedProcedure, router } from "@/server/trpc";
import { auditLog } from "@/server/mock-db";

export const auditRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          actor: z.string().optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        })
        .optional()
    )
    .query(({ input }) => {
      const actor = input?.actor?.trim().toLowerCase();
      const from = input?.from ? new Date(input.from).getTime() : undefined;
      const to = input?.to ? new Date(input.to).getTime() : undefined;

      return auditLog.filter((entry) => {
        if (actor && !entry.actor.toLowerCase().includes(actor)) return false;
        const ts = new Date(entry.timestamp).getTime();
        if (from !== undefined && ts < from) return false;
        if (to !== undefined && ts > to) return false;
        return true;
      });
    }),
});
