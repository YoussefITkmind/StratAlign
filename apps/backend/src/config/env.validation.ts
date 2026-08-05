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
