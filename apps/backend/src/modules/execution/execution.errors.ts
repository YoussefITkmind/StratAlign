export class ExecutionOperationError extends Error {
  constructor(
    readonly code:
      | "EXECUTION_INVALID_PLAY"
      | "EXECUTION_PLAY_OWNERSHIP_REQUIRED"
      | "EXECUTION_INITIATIVE_OWNERSHIP_REQUIRED"
      | "EXECUTION_INITIATIVE_NOT_FOUND"
      | "EXECUTION_JIRA_LINK_NOT_FOUND"
      | "EXECUTION_FEED_LOCKED"
      | "EXECUTION_INVALID_OPERATION",
    message: string,
  ) {
    super(message);
    this.name = "ExecutionOperationError";
  }
}

export const executionErrors = {
  invalidPlay: () => new ExecutionOperationError(
    "EXECUTION_INVALID_PLAY",
    "Initiatives must align to an active strategic play",
  ),
  playOwnershipRequired: () => new ExecutionOperationError(
    "EXECUTION_PLAY_OWNERSHIP_REQUIRED",
    "Only an owner of this strategic play or an SEO administrator may register an initiative",
  ),
  initiativeOwnershipRequired: () => new ExecutionOperationError(
    "EXECUTION_INITIATIVE_OWNERSHIP_REQUIRED",
    "Only the initiative owner, strategic play owner, or SEO administrator can modify the initiative",
  ),
  initiativeNotFound: () => new ExecutionOperationError(
    "EXECUTION_INITIATIVE_NOT_FOUND",
    "Initiative not found",
  ),
  jiraLinkNotFound: () => new ExecutionOperationError(
    "EXECUTION_JIRA_LINK_NOT_FOUND",
    "Jira link not found",
  ),
  feedLocked: () => new ExecutionOperationError(
    "EXECUTION_FEED_LOCKED",
    "This feed-bound attribute is locked and cannot be changed manually",
  ),
  invalidOperation: (message = "Unable to complete execution operation") =>
    new ExecutionOperationError("EXECUTION_INVALID_OPERATION", message),
};
