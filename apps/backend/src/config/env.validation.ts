import { z } from "zod";

const LOOPBACK_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

const strictEnvironmentBoolean = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .default(false);


function booleanFlag(defaultValue: boolean) {
  return z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .default(defaultValue);
}

function validateOidcUrl(
  value: string,
  field: "AUTH_OIDC_ISSUER" | "AUTH_OIDC_JWKS_URI",
  nodeEnvironment: "development" | "test" | "production",
  context: z.RefinementCtx,
): void {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    context.addIssue({
      code: "custom",
      path: [field],
      message: `${field} must be a valid URL`,
    });
    return;
  }

  if (url.username || url.password) {
    context.addIssue({
      code: "custom",
      path: [field],
      message: `${field} must not contain URL credentials`,
    });
  }

  if (url.hash || url.search) {
    context.addIssue({
      code: "custom",
      path: [field],
      message: `${field} must not contain a query string or fragment`,
    });
  }

  if (url.protocol === "https:") {
    return;
  }

  const loopbackHttp =
    url.protocol === "http:" &&
    LOOPBACK_HOSTNAMES.has(url.hostname) &&
    nodeEnvironment !== "production";

  if (!loopbackHttp) {
    context.addIssue({
      code: "custom",
      path: [field],
      message:
        `${field} must use HTTPS, except for loopback HTTP in development or test`,
    });
  }
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

  OBJECT_STORAGE_ENDPOINT: z
    .string()
    .url(),

  OBJECT_STORAGE_ACCESS_KEY: z
    .string()
    .min(1),

  OBJECT_STORAGE_SECRET_KEY: z
    .string()
    .min(1),

  OBJECT_STORAGE_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, {
      message: "OBJECT_STORAGE_BUCKET must be a valid S3 bucket name",
    }),

  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),

  QUEUE_PREFIX: z
    .string()
    .min(1)
    .default("spm"),

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

  WORKER_CONCURRENCY: z.coerce
    .number()
    .int()
    .min(1)
    .default(5),

  SCHEDULER_ENABLED: booleanFlag(true),

  SCHEDULER_TICK_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(60_000),

  SCHEDULER_LOOKAHEAD_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
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

  NOTIFICATION_ENABLED: booleanFlag(true),

  NOTIFICATION_DEFAULT_LOCALE: z
    .literal("en")
    .default("en"),

  NOTIFICATION_FALLBACK_LOCALE: z
    .literal("en")
    .default("en"),

  NOTIFICATION_MAX_ATTEMPTS: z.coerce
    .number()
    .int()
    .min(1)
    .default(5),

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
    .email()
    .optional(),

  EMAIL_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1)
    .default(10_000),

  TEAMS_WEBHOOK_URL: z
    .string()
    .url()
    .optional(),

  TEAMS_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1)
    .default(10_000),

  DIGEST_ENABLED: booleanFlag(true),

  DIGEST_SWEEP_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(300_000),

  DIGEST_MAX_ITEMS: z.coerce
    .number()
    .int()
    .min(1)
    .default(50),

  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 characters"),

  AUTH_OIDC_ISSUER: z.string().min(1),
  AUTH_OIDC_CLIENT_ID: z.string().trim().min(1),
  AUTH_OIDC_JWKS_URI: z.string().min(1),
  AUTH_OIDC_ALLOW_VERIFIED_EMAIL_LINKING: strictEnvironmentBoolean,
}).superRefine((environment, context) => {
  validateOidcUrl(
    environment.AUTH_OIDC_ISSUER,
    "AUTH_OIDC_ISSUER",
    environment.NODE_ENV,
    context,
  );
  validateOidcUrl(
    environment.AUTH_OIDC_JWKS_URI,
    "AUTH_OIDC_JWKS_URI",
    environment.NODE_ENV,
    context,
  );
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
