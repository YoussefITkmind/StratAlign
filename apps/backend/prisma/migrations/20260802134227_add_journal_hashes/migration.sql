/*
  Warnings:

  - Added the required column `entryHash` to the `JournalEntry` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN     "entryHash" TEXT NOT NULL,
ADD COLUMN     "previousHash" TEXT;
