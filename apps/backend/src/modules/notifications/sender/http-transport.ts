import { PermanentError, TransientError } from "../../../errors/app.errors";

export interface HttpPostRequest {
  url: string;
  body: unknown;
  headers?: Record<string, string>;
  timeoutMs: number;
  /** Included in thrown errors so a failure identifies its own sender. */
  context: Record<string, unknown>;
}

export interface HttpPostResponse {
  status: number;
  bodyText: string;
}

/**
 * One JSON POST, with a timeout and a consistent transient/permanent verdict.
 *
 * Shared by the HTTP-based senders so retry semantics are decided once. Uses
 * the global `fetch` and `AbortSignal.timeout` in Node, which is why no HTTP
 * client dependency is introduced.
 */
export async function postJson(
  request: HttpPostRequest,
): Promise<HttpPostResponse> {
  let response: Response;

  try {
    response = await fetch(request.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...request.headers,
      },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(request.timeoutMs),
    });
  } catch (error: unknown) {
    // Network failures, DNS problems and timeouts are all worth another go.
    throw new TransientError(
      "Notification provider request failed before a response was received",
      { ...request.context, timeoutMs: request.timeoutMs },
      { cause: error },
    );
  }

  const bodyText = await response.text().catch(() => "");

  if (response.ok) {
    return { status: response.status, bodyText };
  }

  // 408 and 429 are explicitly retryable; so is anything the provider blames
  // on itself. Every other 4xx means the request will be rejected identically
  // next time.
  const isRetryable =
    response.status >= 500 || response.status === 408 || response.status === 429;

  const errorContext = {
    ...request.context,
    status: response.status,
    responseBody: bodyText.slice(0, 500),
  };

  if (isRetryable) {
    throw new TransientError(
      `Notification provider returned ${response.status}`,
      errorContext,
    );
  }

  throw new PermanentError(
    `Notification provider rejected the request with ${response.status}`,
    errorContext,
  );
}
