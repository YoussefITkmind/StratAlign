-- AlterEnum
ALTER TYPE "governance"."ApprovalDecision" ADD VALUE 'changes_requested';

-- DropIndex
DROP INDEX "governance"."decision_log_entries_case_id_key";

-- CreateIndex
CREATE INDEX "decision_log_entries_case_id_idx"
  ON "governance"."decision_log_entries"("case_id");
