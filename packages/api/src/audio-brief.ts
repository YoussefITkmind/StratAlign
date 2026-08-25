import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "./index";

/**
 * AI Executive Audio Brief surface.
 *
 * Same shape as `assistant.ts`: the service contract lives here, the backend
 * supplies an implementation through context, and this file owns
 * authorisation, input validation, output validation, and the mapping from a
 * domain failure to something a client may see.
 *
 * Any authenticated user may generate a brief. The content is assembled from
 * the same KPI, OKR, and initiative data the platform already serves to
 * signed-in users through the Overview page, so there is no additional gate
 * beyond being signed in.
 */

/** Mirrors `MAX_BRIEF_SCRIPT_LENGTH` in the backend's audio-brief schema. */
const MAX_SCRIPT_LENGTH = 1_400;
const MAX_TITLE_LENGTH = 120;

/**
 * Ceiling on the base64 audio payload. The backend already caps the raw bytes
 * it will accept from the speech provider; this is the transport-side
 * restatement of that bound, so an oversized payload fails here rather than
 * reaching a browser.
 */
const MAX_AUDIO_BASE64_LENGTH = 12_000_000;

const generateAudioBriefInputSchema = z
  .object({
    /**
     * Reserved for role-personalised briefs. Accepted and ignored in v1 — it
     * is here so adding personalisation later does not change this contract.
     */
    role: z.string().trim().min(1).max(60).optional(),
  })
  .strict()
  .default({});

export type GenerateAudioBriefApiInput = z.infer<typeof generateAudioBriefInputSchema>;

const audioBriefOutputSchema = z
  .object({
    title: z.string().max(MAX_TITLE_LENGTH),
    script: z.string().max(MAX_SCRIPT_LENGTH),
    /** True when the fixed no-significant-changes message was spoken. */
    insufficientData: z.boolean(),
    audio: z
      .object({
        base64: z.string().min(1).max(MAX_AUDIO_BASE64_LENGTH),
        contentType: z.string().min(1).max(100),
        format: z.literal("mp3"),
      })
      .strict(),
  })
  .strict();

export type AudioBriefOutput = z.infer<typeof audioBriefOutputSchema>;

export interface AudioBriefServiceContract {
  generate(input: {
    actorUserId: string;
    role?: string;
  }): Promise<AudioBriefOutput>;
}

declare module "./index" {
  interface TrpcContext {
    audioBrief?: AudioBriefServiceContract;
  }
}

function service(ctx: {
  audioBrief?: AudioBriefServiceContract;
}): AudioBriefServiceContract {
  if (!ctx.audioBrief) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Audio brief service unavailable",
    });
  }
  return ctx.audioBrief;
}

/**
 * Maps a service failure to something a client may see. Every branch returns a
 * fixed message: an upstream provider error can carry account identifiers or
 * echoed prompt text, and the assembled brief itself contains business data,
 * so none of it is forwarded.
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
        message: "The audio brief is unavailable right now. Try again later.",
      });
    case "AI_TIMEOUT":
      return new TRPCError({
        code: "TIMEOUT",
        message: "The audio brief took too long to generate. Try again.",
      });
    case "AI_MALFORMED_OUTPUT":
      return new TRPCError({
        code: "UNPROCESSABLE_CONTENT",
        message: "The audio brief could not be prepared. Try again.",
      });
    default:
      return new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to generate the audio brief",
      });
  }
}

export const audioBriefRouter = router({
  /**
   * A mutation, not a query: it spends money on two provider calls and must
   * never be replayed by a client-side refetch.
   */
  generate: protectedProcedure
    .input(generateAudioBriefInputSchema)
    .output(audioBriefOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await service(ctx).generate({
          actorUserId: ctx.session.user.id,
          role: input.role,
        });
      } catch (error) {
        throw toAudioBriefError(error);
      }
    }),
});
