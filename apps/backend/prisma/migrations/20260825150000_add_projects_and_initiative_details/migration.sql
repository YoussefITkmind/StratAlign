-- ADR-06 boundary respected: these additions remain thin linkage/tracking
-- attributes (category, dates, a single budget figure, Jira/Confluence
-- links). No task lists, resource assignments, dependency graphs, or Gantt
-- scheduling are introduced here.

CREATE TYPE "execution"."Priority" AS ENUM ('critical', 'high', 'medium', 'low');

ALTER TABLE "execution"."initiatives"
  ADD COLUMN "priority" "execution"."Priority" NOT NULL DEFAULT 'medium',
  ADD COLUMN "department" TEXT,
  ADD COLUMN "start_date" DATE,
  ADD COLUMN "end_date" DATE,
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE "execution"."projects" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "description" TEXT,
  "department" TEXT,
  "owner_user_id" TEXT NOT NULL,
  "parent_initiative_id" UUID,
  "start_date" DATE,
  "end_date" DATE,
  "budget_amount" NUMERIC(20, 6),
  "priority" "execution"."Priority" NOT NULL DEFAULT 'medium',
  "jira_board_url" TEXT,
  "confluence_space_url" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "projects_parent_initiative_idx" ON "execution"."projects"("parent_initiative_id");
CREATE INDEX "projects_owner_idx" ON "execution"."projects"("owner_user_id");

ALTER TABLE "execution"."projects" ADD CONSTRAINT "projects_owner_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "execution"."projects" ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "execution"."projects" ADD CONSTRAINT "projects_parent_initiative_fkey" FOREIGN KEY ("parent_initiative_id") REFERENCES "execution"."initiatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;
