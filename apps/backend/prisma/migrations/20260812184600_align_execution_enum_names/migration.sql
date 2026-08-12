BEGIN;

-- Phase 4.1 created PostgreSQL enum types with snake_case names while the
-- Prisma schema uses PascalCase enum model names. Renaming the PostgreSQL types
-- preserves every table/column/value and makes generated Prisma CRUD queries
-- target the real enum types correctly.
ALTER TYPE execution.initiative_stage RENAME TO "InitiativeStage";
ALTER TYPE execution.milestone_health RENAME TO "MilestoneHealth";
ALTER TYPE execution.execution_source RENAME TO "ExecutionSource";
ALTER TYPE execution.initiative_status RENAME TO "InitiativeStatus";
ALTER TYPE execution.confidence_level RENAME TO "ConfidenceLevel";
ALTER TYPE execution.risk_level RENAME TO "RiskLevel";

COMMIT;
