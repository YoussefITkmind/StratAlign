import { z } from "zod";

export const perspectiveWeightsSchema = z
  .record(z.string().uuid(), z.number().finite().positive())
  .superRefine((weights, ctx) => {
    const values = Object.values(weights);
    if (values.length === 0) {
      ctx.addIssue({ code: "custom", message: "At least one perspective weight is required" });
      return;
    }
    const total = values.reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 100) > 0.001) {
      ctx.addIssue({ code: "custom", message: "Perspective weights must total 100" });
    }
  });

export const mapLinkSchema = z
  .object({
    fromObjectiveId: z.string().uuid(),
    toObjectiveId: z.string().uuid(),
    strength: z.enum(["weak", "strong", "enables", "impacts", "drives", "supports"]),
  })
  .strict()
  .refine((link) => link.fromObjectiveId !== link.toObjectiveId, {
    message: "A strategy-map link cannot target the same objective",
    path: ["toObjectiveId"],
  });

export type PerspectiveWeights = z.infer<typeof perspectiveWeightsSchema>;
export type MapLinkInput = z.infer<typeof mapLinkSchema>;

export function validatePerspectiveWeights(
  weights: unknown,
  perspectiveIds?: readonly string[],
): PerspectiveWeights {
  const parsed = perspectiveWeightsSchema.parse(weights);
  if (perspectiveIds) {
    const expected = [...perspectiveIds].sort();
    const actual = Object.keys(parsed).sort();
    if (expected.length !== actual.length || expected.some((id, index) => id !== actual[index])) {
      throw new Error("Perspective weights must contain exactly the scorecard perspectives");
    }
  }
  return parsed;
}

export function validateMapLink(input: unknown): MapLinkInput {
  return mapLinkSchema.parse(input);
}
