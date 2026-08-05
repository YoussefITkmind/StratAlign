BEGIN;

-- Abort before changing the schema if a legacy identity is incomplete.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "iam"."users"
        WHERE ("oidc_issuer" IS NULL) <> ("oidc_subject" IS NULL)
    ) THEN
        RAISE EXCEPTION 'Cannot migrate OIDC identities: found a user with only one of oidc_issuer or oidc_subject set';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "iam"."users"
        WHERE "oidc_issuer" IS NOT NULL
          AND (
              BTRIM("oidc_issuer") = ''
              OR BTRIM("oidc_subject") = ''
          )
    ) THEN
        RAISE EXCEPTION 'Cannot migrate OIDC identities: found an empty oidc_issuer or oidc_subject';
    END IF;
END
$$;

-- CreateTable
CREATE TABLE "iam"."oidc_identities" (
    "id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email_at_link" TEXT,
    "email_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oidc_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oidc_identities_issuer_subject_key"
ON "iam"."oidc_identities"("issuer", "subject");

-- CreateIndex
CREATE INDEX "oidc_identities_user_id_idx"
ON "iam"."oidc_identities"("user_id");

-- AddForeignKey
ALTER TABLE "iam"."oidc_identities"
ADD CONSTRAINT "oidc_identities_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "iam"."users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve complete legacy OIDC associations and their platform user UUIDs.
INSERT INTO "iam"."oidc_identities" (
    "id",
    "issuer",
    "subject",
    "user_id",
    "email_at_link",
    "email_verified_at",
    "created_at",
    "updated_at"
)
SELECT
    GEN_RANDOM_UUID()::TEXT,
    "oidc_issuer",
    "oidc_subject",
    "id",
    "email",
    "email_verified_at",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "iam"."users"
WHERE "oidc_issuer" IS NOT NULL
  AND "oidc_subject" IS NOT NULL;

-- Remove the legacy representation only after its data has been copied.
DROP INDEX "iam"."users_oidc_issuer_oidc_subject_key";

ALTER TABLE "iam"."users"
DROP COLUMN "oidc_issuer",
DROP COLUMN "oidc_subject";

COMMIT;
