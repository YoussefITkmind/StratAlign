BEGIN;

CREATE TYPE "iam"."OrgScopeType" AS ENUM ('group', 'sector', 'function');

ALTER TABLE "iam"."oidc_identities"
  ADD COLUMN "groups" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "last_validated_at" TIMESTAMP(3);

CREATE TABLE "iam"."roles" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "roles_name_key" UNIQUE ("name")
);

CREATE TABLE "iam"."group_role_mappings" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "group_claim" TEXT NOT NULL,
  "role_id" TEXT NOT NULL,
  "org_scope_type" "iam"."OrgScopeType" NOT NULL,
  "org_scope_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "is_current" BOOLEAN NOT NULL DEFAULT true,
  "supersedes_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL,
  CONSTRAINT "group_role_mappings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "group_role_mappings_version_check" CHECK ("version" > 0),
  CONSTRAINT "group_role_mappings_group_claim_check" CHECK (length(btrim("group_claim")) > 0),
  CONSTRAINT "group_role_mappings_org_scope_id_check" CHECK (length(btrim("org_scope_id")) > 0),
  CONSTRAINT "group_role_mappings_group_claim_version_key" UNIQUE ("group_claim", "version"),
  CONSTRAINT "group_role_mappings_supersedes_id_key" UNIQUE ("supersedes_id")
);

CREATE UNIQUE INDEX "group_role_mappings_one_current_per_group"
  ON "iam"."group_role_mappings" ("group_claim") WHERE "is_current" = true;
CREATE INDEX "group_role_mappings_group_claim_is_current_idx" ON "iam"."group_role_mappings" ("group_claim", "is_current");
CREATE INDEX "group_role_mappings_role_id_idx" ON "iam"."group_role_mappings" ("role_id");
CREATE INDEX "group_role_mappings_created_by_idx" ON "iam"."group_role_mappings" ("created_by");

CREATE TABLE "iam"."scope_grants" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "user_id" TEXT NOT NULL,
  "role_id" TEXT NOT NULL,
  "org_scope_type" "iam"."OrgScopeType" NOT NULL,
  "org_scope_id" TEXT NOT NULL,
  "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "granted_by" TEXT NOT NULL,
  CONSTRAINT "scope_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scope_grants_org_scope_id_check" CHECK (length(btrim("org_scope_id")) > 0),
  CONSTRAINT "scope_grants_user_role_scope_key" UNIQUE ("user_id", "role_id", "org_scope_type", "org_scope_id")
);

CREATE INDEX "scope_grants_user_id_idx" ON "iam"."scope_grants" ("user_id");
CREATE INDEX "scope_grants_role_id_idx" ON "iam"."scope_grants" ("role_id");
CREATE INDEX "scope_grants_granted_by_idx" ON "iam"."scope_grants" ("granted_by");

CREATE TABLE "iam"."step_up_policies" (
  "action_class" TEXT NOT NULL,
  "requires_step_up" BOOLEAN NOT NULL,
  "max_session_age_seconds" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "step_up_policies_pkey" PRIMARY KEY ("action_class"),
  CONSTRAINT "step_up_policies_max_age_check" CHECK ("max_session_age_seconds" > 0)
);

ALTER TABLE "iam"."group_role_mappings"
  ADD CONSTRAINT "group_role_mappings_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "iam"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "group_role_mappings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "group_role_mappings_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "iam"."group_role_mappings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "iam"."scope_grants"
  ADD CONSTRAINT "scope_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "scope_grants_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "iam"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "scope_grants_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
