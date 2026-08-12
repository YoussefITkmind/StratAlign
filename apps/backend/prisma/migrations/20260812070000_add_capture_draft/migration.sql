ALTER TABLE "performance"."capture_sessions"
  ADD COLUMN "draft_value" DECIMAL(30,10),
  ADD COLUMN "draft_evidence_ref" TEXT;
