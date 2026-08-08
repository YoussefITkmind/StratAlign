-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "audit";

-- CreateTable
CREATE TABLE "audit"."journal_entries" (
    "id" TEXT NOT NULL,
    "sequence_number" BIGINT NOT NULL,
    "event_type" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "correlation_id" TEXT,
    "actor_user_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "previous_hash" TEXT,
    "entry_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit"."entity_snapshots" (
    "id" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot_data" JSONB NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_sequence_number_key" ON "audit"."journal_entries"("sequence_number");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_entry_hash_key" ON "audit"."journal_entries"("entry_hash");

-- CreateIndex
CREATE INDEX "journal_entries_aggregate_type_aggregate_id_occurred_at_idx" ON "audit"."journal_entries"("aggregate_type", "aggregate_id", "occurred_at");

-- CreateIndex
CREATE INDEX "journal_entries_occurred_at_idx" ON "audit"."journal_entries"("occurred_at");

-- CreateIndex
CREATE INDEX "entity_snapshots_aggregate_type_aggregate_id_valid_from_val_idx" ON "audit"."entity_snapshots"("aggregate_type", "aggregate_id", "valid_from", "valid_to");

-- CreateIndex
CREATE UNIQUE INDEX "entity_snapshots_aggregate_type_aggregate_id_version_key" ON "audit"."entity_snapshots"("aggregate_type", "aggregate_id", "version");
