import { plainToInstance, Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  validateSync,
} from "class-validator";

enum NodeEnvironment {
  Development = "development",
  Test = "test",
  Production = "production",
}

class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  NODE_ENV!: NodeEnvironment;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT!: number;

  @IsUrl({
    require_tld: false,
    protocols: ["http", "https"],
  })
  FRONTEND_URL!: string;

  @IsString()
  @Matches(/^postgres(?:ql)?:\/\//, {
    message: "DATABASE_URL must be a PostgreSQL connection URL",
  })
  DATABASE_URL!: string;

  @IsString()
  @Matches(/^rediss?:\/\//, {
    message: "REDIS_URL must be a Redis connection URL",
  })
  REDIS_URL!: string;
}

export function validateEnvironment(
  configuration: Record<string, unknown>,
): Record<string, unknown> {
  const validatedConfiguration = plainToInstance(
    EnvironmentVariables,
    configuration,
    {
      enableImplicitConversion: true,
    },
  );

  const errors = validateSync(validatedConfiguration, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .flatMap((error) => Object.values(error.constraints ?? {}))
      .join("; ");

    throw new Error(`Environment validation failed: ${messages}`);
  }

  return configuration;
}