export class PortfolioError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PortfolioError";
  }
}

export const portfolioErrors = {
  areaOfFocusNotFound: () =>
    new PortfolioError("PORTFOLIO_AOF_NOT_FOUND", "Active Area of Focus was not found"),
  ragRuleNotFound: () =>
    new PortfolioError("PORTFOLIO_RAG_RULE_NOT_FOUND", "Published RAG aggregation rule was not found"),
  noInitiativeStatuses: () =>
    new PortfolioError("PORTFOLIO_NO_STATUS_DATA", "No mapped initiative status data exists for this period"),
  hierarchyImportInvalid: (message: string) =>
    new PortfolioError("PORTFOLIO_HIERARCHY_IMPORT_INVALID", message),
  hierarchyImportNotFound: () =>
    new PortfolioError("PORTFOLIO_HIERARCHY_IMPORT_NOT_FOUND", "Portfolio hierarchy import was not found"),
  hierarchyImportNotReady: (message: string) =>
    new PortfolioError("PORTFOLIO_HIERARCHY_IMPORT_NOT_READY", message),
};
