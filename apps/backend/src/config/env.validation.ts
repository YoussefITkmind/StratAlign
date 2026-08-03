import { z } from "zod";

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