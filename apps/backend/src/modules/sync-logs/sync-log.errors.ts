/** Failure taxonomy for the Sync Logs domain. Mirrors `AiThemeNotFoundError`'s
 * shape: a stable `code`, a message safe to show a user, no internal detail. */
export class SyncRunNotFoundError extends Error {
  readonly code = "SYNC_RUN_NOT_FOUND";

  constructor(message = "Sync run was not found") {
    super(message);
    this.name = "SyncRunNotFoundError";
  }
}
