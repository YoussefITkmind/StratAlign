export class IntegrationsError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "IntegrationsError";
  }
}

export const integrationsErrors = {
  connectionNotFound: () =>
    new IntegrationsError("INTEGRATIONS_CONNECTION_NOT_FOUND", "Connection was not found"),
  apiKeyNotFound: () =>
    new IntegrationsError("INTEGRATIONS_API_KEY_NOT_FOUND", "API key was not found"),
  webhookNotFound: () =>
    new IntegrationsError("INTEGRATIONS_WEBHOOK_NOT_FOUND", "Webhook was not found"),
  syncLogNotFound: () =>
    new IntegrationsError("INTEGRATIONS_SYNC_LOG_NOT_FOUND", "Sync log entry was not found"),
};
