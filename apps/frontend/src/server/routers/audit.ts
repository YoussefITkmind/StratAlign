import { z } from "zod";
import { authenticatedProcedure, router } from "@/server/trpc";
import {
  createBackendIamClient,
  translateBackendIamError,
} from "@/server/backend-iam-client";

function detailsFromPayload(
  payload: unknown,
  aggregateType: string,
  aggregateId: string,
): string {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const value = payload as Record<string, unknown>;

    if (typeof value.procedurePath === "string") {
      return value.procedurePath;
    }
  }

  return `${aggregateType}:${aggregateId}`;
}

export const auditRouter = router({
  list: authenticatedProcedure
    .input(
      z
        .object({
          actor: z.string().optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      try {
        const entries = await createBackendIamClient(
          ctx.cookieHeader,
        ).audit.listEntries.query({
          actor: input?.actor?.trim() || undefined,
          from: input?.from,
          to: input?.to,
          limit: 200,
        });

        return entries.map((entry) => ({
          id: entry.id,
          eventType: entry.eventType,
          actor: entry.actorEmail ?? entry.actorUserId ?? "system",
          timestamp: new Date(entry.occurredAt).toISOString(),
          details: detailsFromPayload(
            entry.payload,
            entry.aggregateType,
            entry.aggregateId,
          ),
        }));
      } catch (error) {
        translateBackendIamError(error);
      }
    }),
});
