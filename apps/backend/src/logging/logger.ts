/**
 * Structured logging over the console transport already used by the backend
 * entrypoint. Deliberately thin: one JSON line per record, so log aggregation
 * can parse it, while `pnpm dev` still shows something readable. No logging
 * dependency is introduced.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: unknown, context?: LogContext): void;
  /** Derives a logger that inherits this one's scope and bound context. */
  child(scope: string, context?: LogContext): Logger;
}

const LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function describeError(error: unknown): LogContext {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack,
    };
  }

  return {
    errorName: "UnknownError",
    errorMessage: String(error),
  };
}

class ConsoleLogger implements Logger {
  constructor(
    private readonly minimumLevel: LogLevel,
    private readonly scope: string,
    private readonly boundContext: LogContext,
  ) {}

  debug(message: string, context?: LogContext): void {
    this.write("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write("warn", message, context);
  }

  error(message: string, error?: unknown, context?: LogContext): void {
    this.write("error", message, {
      ...context,
      ...(error === undefined ? {} : describeError(error)),
    });
  }

  child(scope: string, context?: LogContext): Logger {
    return new ConsoleLogger(
      this.minimumLevel,
      `${this.scope}.${scope}`,
      {
        ...this.boundContext,
        ...context,
      },
    );
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    if (LEVEL_SEVERITY[level] < LEVEL_SEVERITY[this.minimumLevel]) {
      return;
    }

    const record = JSON.stringify({
      level,
      scope: this.scope,
      message,
      timestamp: new Date().toISOString(),
      ...this.boundContext,
      ...context,
    });

    if (level === "error") {
      console.error(record);
      return;
    }

    if (level === "warn") {
      console.warn(record);
      return;
    }

    console.log(record);
  }
}

export function createLogger(
  minimumLevel: LogLevel,
  scope = "spm-backend",
  context: LogContext = {},
): Logger {
  return new ConsoleLogger(minimumLevel, scope, context);
}
