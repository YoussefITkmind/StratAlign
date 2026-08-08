/*
  Warnings:

  - A unique constraint covering the columns `[source_event_id]` on the table `journal_entries` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "audit"."journal_entries" ADD COLUMN     "source_event_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_source_event_id_key" ON "audit"."journal_entries"("source_event_id");
