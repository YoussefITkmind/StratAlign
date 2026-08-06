import { z } from "zod";
import { PermanentError } from "../../errors/app.errors";
import type { CadenceSpec } from "./cadence.types";

/**
 * Cadence configuration is stored as JSON, so it is validated on the way in
 * (when a definition is written) and again on the way out (before it drives
 * generation). Validating only at write time would leave the generator at the
 * mercy of rows written by an older deploy or by hand.
 */

const timeOfDayPattern = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

const timeOfDay = z
  .string()
  .regex(timeOfDayPattern, "atTime must be formatted HH:mm or HH:mm:ss");

const weekday = z.number().int().min(0).max(6);

const monthEndPolicy = z
  .enum(["CLAMP_TO_LAST_DAY", "SKIP_MONTH"])
  .default("CLAMP_TO_LAST_DAY");

const onceSchema = z.object({
  type: z.literal("ONCE"),
  runAt: z.string().datetime({ offset: true }),
});

const intervalSchema = z.object({
  type: z.literal("INTERVAL"),
  everySeconds: z
    .number()
    .int()
    .min(60, "INTERVAL cadences must be at least 60 seconds apart"),
});

const dailySchema = z.object({
  type: z.literal("DAILY"),
  atTime: timeOfDay,
  onWeekdays: z.array(weekday).nonempty().optional(),
});

const weeklySchema = z.object({
  type: z.literal("WEEKLY"),
  atTime: timeOfDay,
  onWeekdays: z.array(weekday).nonempty(),
  everyNWeeks: z.number().int().min(1).max(52).default(1),
});

const monthlySchema = z
  .object({
    type: z.literal("MONTHLY"),
    atTime: timeOfDay,
    onDayOfMonth: z.number().int().min(1).max(31).optional(),
    onNthWeekday: z
      .object({
        // -1 selects the last matching weekday of the month.
        nth: z.number().int().min(-1).max(5).refine((value) => value !== 0, {
          message: "onNthWeekday.nth cannot be 0",
        }),
        weekday,
      })
      .optional(),
    everyNMonths: z.number().int().min(1).max(12).default(1),
    monthEndPolicy,
  })
  .refine(
    (value) =>
      (value.onDayOfMonth === undefined) !== (value.onNthWeekday === undefined),
    {
      message:
        "MONTHLY cadences require exactly one of onDayOfMonth or onNthWeekday",
    },
  );

const quarterlySchema = z.object({
  type: z.literal("QUARTERLY"),
  atTime: timeOfDay,
  monthOffsetInQuarter: z.number().int().min(0).max(2).default(0),
  onDayOfMonth: z.number().int().min(1).max(31),
  monthEndPolicy,
});

const annualSchema = z.object({
  type: z.literal("ANNUAL"),
  atTime: timeOfDay,
  onMonth: z.number().int().min(1).max(12),
  onDayOfMonth: z.number().int().min(1).max(31),
  monthEndPolicy,
});

const cronSchema = z.object({
  type: z.literal("CRON"),
  expression: z
    .string()
    .trim()
    .refine((value) => value.split(/\s+/).length === 5, {
      message: "CRON expressions must have exactly 5 fields",
    }),
});

export const cadenceSpecSchema = z.discriminatedUnion("type", [
  onceSchema,
  intervalSchema,
  dailySchema,
  weeklySchema,
  monthlySchema,
  quarterlySchema,
  annualSchema,
  cronSchema,
]);

export function parseCadenceSpec(value: unknown): CadenceSpec {
  const result = cadenceSpecSchema.safeParse(value);

  if (!result.success) {
    const messages = result.error.issues.map((issue) => issue.message).join("; ");

    // Invalid configuration cannot be fixed by retrying the job.
    throw new PermanentError(`Invalid cadence configuration: ${messages}`, {
      issues: result.error.issues,
    });
  }

  return result.data as CadenceSpec;
}
