-- CreateTable
CREATE TABLE "strategy_hierarchy"."strategy_briefs" (
    "id" UUID NOT NULL,
    "root_node_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "executive_summary_override" TEXT,
    "strategic_vision_override" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "generated_by" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "strategy_briefs_root_node_id_key" ON "strategy_hierarchy"."strategy_briefs"("root_node_id");

-- CreateIndex
CREATE INDEX "strategy_briefs_generated_by_idx" ON "strategy_hierarchy"."strategy_briefs"("generated_by");

-- AddForeignKey
ALTER TABLE "strategy_hierarchy"."strategy_briefs" ADD CONSTRAINT "strategy_briefs_root_node_id_fkey" FOREIGN KEY ("root_node_id") REFERENCES "strategy_hierarchy"."strategy_hierarchy_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_hierarchy"."strategy_briefs" ADD CONSTRAINT "strategy_briefs_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
