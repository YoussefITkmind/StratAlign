-- Add description_en and description_ar to strategy_nodes
ALTER TABLE "strategy"."strategy_nodes"
  ADD COLUMN "description_en" TEXT,
  ADD COLUMN "description_ar" TEXT;
