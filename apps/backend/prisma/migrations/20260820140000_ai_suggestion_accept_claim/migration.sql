-- Task 3 follow-up: make accepting a suggestion safe under concurrency.
--
-- Provenance used to be written after the KPI or OKR existed, which left a
-- window where two concurrent accepts of the same proposal both read "no
-- provenance yet" and both created a record. The unique key on suggestion_id
-- protected the provenance row but not the domain record — by the time the
-- loser hit the constraint it had already created a second KPI.
--
-- The row is now inserted first, as a claim, with subject_id still unknown.
-- That makes the unique index the serialisation point ahead of any domain
-- write: the loser never reaches creation at all, and instead waits for the
-- winner to fill subject_id in.
--
-- PostgreSQL treats NULLs as distinct in a unique index, so the existing
-- (subject_type, subject_id) uniqueness still holds for settled rows while any
-- number of unrelated claims can be in flight at once.
ALTER TABLE "registry"."ai_suggestion_provenance"
  ALTER COLUMN "subject_id" DROP NOT NULL;
