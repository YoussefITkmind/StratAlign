import { z } from "zod";

/**
 * Environment flags arrive as strings. `z.coerce.boolean()` is unusable here
 * because it follows JavaScript truthiness, which turns the string "false"
 * into `true`. This accepts the conventional spellings explicitly and rejects
 * anything else rather than silently defaulting.
 */
function booleanFlag(defaultValue: boolean) {
  const trueValues = new Set(["1", "true", "yes", "on"]);
  const falseValues = new Set(["0", "false", "no", "off"]);

  return z
    .union([z.boolean(), z.string()])
    .default(defaultValue)
    .transform((value, context) => {
      if (typeof value === "boolean") {
        return value;
      }

      const normalized = value.trim().toLowerCase();

      if (trueValues.has(normalized)) {
        return true;
      }

      if (falseValues.has(normalized)) {
        return false;
      }

      context.addIssue({
        code: "custom",
        message: `"${value}" is not a valid boolean flag`,
      });

      return z.NEVER;
    });
}

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535, "PORT must not be greater than 65535")
    .default(4000),

  FRONTEND_URL: z
    .string()
    .url()
    .default("http://localhost:3000"),

  DATABASE_URL: z
    .string()
    .regex(/^postgres(?:ql)?:\/\//, {
      message: "DATABASE_URL must be a PostgreSQL connection URL",
    }),

  REDIS_URL: z
    .string()
    .regex(/^rediss?:\/\//, {
      message: "REDIS_URL must be a Redis connection URL",
    }),

  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),

  // -------------------------------------------------------------------------
  // Queue infrastructure
  // -------------------------------------------------------------------------

  QUEUE_PREFIX: z
    .string()
    .min(1)
    .default("spm"),

  WORKER_CONCURRENCY: z.coerce
    .number()
    .int()
    .min(1, "WORKER_CONCURRENCY must be at least 1")
    .default(5),

  // -------------------------------------------------------------------------
  // Scheduler
  // -------------------------------------------------------------------------

  SCHEDULER_ENABLED: booleanFlag(true),

  SCHEDULER_TICK_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1000, "SCHEDULER_TICK_INTERVAL_MS must be at least 1000")
    .default(60_000),

  SCHEDULER_LOOKAHEAD_SECONDS: z.coerce
    .number()
    .int()
    .min(0)
    .default(300),

  SCHEDULER_TICK_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(1)
    .default(500),

  SCHEDULER_MAX_CATCHUP_OCCURRENCES: z.coerce
    .number()
    .int()
    .min(1)
    .default(50),

  SCHEDULER_DEFAULT_TIMEZONE: z
    .string()
    .min(1)
    .default("UTC"),

  // -------------------------------------------------------------------------
  // Event outbox
  // -------------------------------------------------------------------------

  EVENT_RELAY_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1000, "EVENT_RELAY_INTERVAL_MS must be at least 1000")
    .default(5_000),

  EVENT_RELAY_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(1)
    .default(200),

  // -------------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------------

  NOTIFICATION_ENABLED: booleanFlag(true),

  NOTIFICATION_DEFAULT_LOCALE: z
    .string()
    .min(2)
    .default("en"),

  NOTIFICATION_FALLBACK_LOCALE: z
    .string()
    .min(2)
    .default("en"),

  NOTIFICATION_MAX_ATTEMPTS: z.coerce
    .number()
    .int()
    .min(1)
    .default(5),

  /**
   * "fake" routes every channel to the in-memory sender. It is the default so
   * a misconfigured deployment can never silently send real messages — live
   * delivery has to be opted into.
   */
  NOTIFICATION_SENDER_MODE: z
    .enum(["live", "fake"])
    .default("fake"),

  EMAIL_API_URL: z
    .string()
    .url()
    .optional(),

  EMAIL_API_KEY: z
    .string()
    .min(1)
    .optional(),

  EMAIL_FROM_ADDRESS: z
    .string()
    .email("EMAIL_FROM_ADDRESS must be a valid email address")
    .optional(),

  EMAIL_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .default(10_000),

  TEAMS_WEBHOOK_URL: z
    .string()
    .url()
    .optional(),

  TEAMS_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .default(10_000),

  // -------------------------------------------------------------------------
  // Digest
  // -------------------------------------------------------------------------

  DIGEST_ENABLED: booleanFlag(true),

  DIGEST_SWEEP_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1000, "DIGEST_SWEEP_INTERVAL_MS must be at least 1000")
    .default(300_000),

  DIGEST_MAX_ITEMS: z.coerce
    .number()
    .int()
    .min(1)
    .default(50),
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  configuration: Record<string, unknown>,
): Environment {
  const result = environmentSchema.safeParse(configuration);

  if (!result.success) {
    const messages = result.error.issues
      .map((issue) => issue.message)
      .join("; ");

    throw new Error(`Environment validation failed: ${messages}`);
  }

  return result.data;
}