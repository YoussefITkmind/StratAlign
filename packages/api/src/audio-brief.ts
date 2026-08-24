import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "./index";

/**
 * Executive Audio Brief surface (Task 6).
 *
 * Follows the same shape as `ai-suggestion.ts` and `assistant.ts`: the
 * service contract lives here, the backend supplies an implementation
 * through context, and the router owns authorisation, strict input
 * validation, output validation, and the mapping from domain errors to
 * codes a client may see.
 *
 * The input is deliberately empty. The backend retrieves and prioritises the
 * report data itself — the frontend never sends KPI/OKR/initiative data for
 * this endpoint to forward to the model.
 */

export type AudioBriefItemKind = "kpi" | "okr" | "initiative";
export type AudioBriefItemImportance = "critical" | "medium" | "positive";

export interface AudioBriefItemOutput {
  type: AudioBriefItemKind;
  name: string;
  importance: AudioBriefItemImportance;
  reason: string;
}

export interface AudioBriefOutput {
  title: string;
  script: string;
  items: AudioBriefItemOutput[];
  /** Base64-encoded MP3 audio. */
  audioBase64: string;
  audioMimeType: string;
  provider: string;
  model: string;
  ttsProvider: string;
  ttsModel: string;
  latencyMs: number;
}

export interface AudioBriefServiceContract {
  generate(actorUserId: string): Promise<AudioBriefOutput>;
}

declare module "./index" {
  interface TrpcContext {
    audioBrief?: AudioBriefServiceContract;
  }
}

const service = (ctx: {
  audioBrief?: AudioBriefServiceContract;
}): AudioBriefServiceContract => {
  if (!ctx.audioBrief) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Audio brief service unavailable",
    });
  }
  return ctx.audioBrief;
};

const audioBriefItemOutputSchema = z
  .object({
    type: z.enum(["kpi", "okr", "initiative"]),
    name: z.string(),
    importance: z.enum(["critical", "medium", "positive"]),
    reason: z.string(),
  })
  .strict();

const audioBriefOutputSchema = z
  .object({
    title: z.string(),
    script: z.string(),
    items: z.array(audioBriefItemOutputSchema),
    audioBase64: z.string(),
    audioMimeType: z.string(),
    provider: z.string(),
    model: z.string(),
    ttsProvider: z.string(),
    ttsModel: z.string(),
    latencyMs: z.number().nonnegative(),
  })
  .strict();

/**
 * Maps a service failure to something a client may see. A fixed message per
 * branch, same reasoning as `ai-suggestion.ts#toSuggestionError`: an upstream
 * provider error can carry account identifiers or echoed prompt text, so
 * nothing from it is ever forwarded.
 */
function toAudioBriefError(error: unknown): TRPCError {
  if (error instanceof TRPCError) {
    return error;
  }

  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;

  switch (code) {
    case "AI_UNAVAILABLE":
      return new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: "Unable to generate the audio brief. Please try again.",
      });
    case "AI_TIMEOUT":
      return new TRPCError({
        code: "TIMEOUT",
        message: "Unable to generate the audio brief. Please try again.",
      });
    case "AI_MALFORMED_OUTPUT":
      return new TRPCError({
        code: "UNPROCESSABLE_CONTENT",
        message: "Unable to generate the audio brief. Please try again.",
      });
    default:
      return new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to generate the audio brief. Please try again.",
      });
  }
}

export const audioBriefRouter = router({
  /**
   * A mutation, not a query: it spends money, is not cacheable, and must
   * never be replayed by a client-side refetch.
   */
  generate: protectedProcedure
    .input(z.object({}).strict())
    .output(audioBriefOutputSchema)
    .mutation(async ({ ctx }) => {
      try {
        return await service(ctx).generate(ctx.session.user.id);
      } catch (error) {
        throw toAudioBriefError(error);
      }
    }),
});
