import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiKeyAuthService } from "./api-key-auth.service";

function respondJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function extractBearerToken(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Minimal public API surface, mounted under /api/v1/ outside the tRPC
 * router, authenticated by the keys minted on the Data & Integrations page.
 * Its only purpose is to prove those keys actually grant access to
 * something — before this, a created key was a database row nothing ever
 * consumed.
 */
export async function handlePublicApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  apiKeyAuth: ApiKeyAuthService,
): Promise<void> {
  try {
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      respondJson(response, 401, { error: "Missing or malformed Authorization: Bearer <key> header" });
      return;
    }

    const verified = await apiKeyAuth.verify(token);
    if (!verified) {
      respondJson(response, 401, { error: "Invalid, disabled, or expired API key" });
      return;
    }

    const url = (request.url ?? "").split("?")[0];
    if (url === "/api/v1/whoami" && request.method === "GET") {
      respondJson(response, 200, {
        keyId: verified.id,
        keyName: verified.name,
        scope: verified.scope,
        owner: verified.ownerName,
      });
      return;
    }

    respondJson(response, 404, { error: "Not found" });
  } catch {
    respondJson(response, 500, { error: "Unable to complete the request" });
  }
}
