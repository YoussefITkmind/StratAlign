-- Measurement immutability, enforced by PostgreSQL rather than by application code.
--
-- The application connects as, or as a member of, the "spm_app" role. That role
-- is granted SELECT and INSERT on performance.measurements and nothing else, so
-- an UPDATE or DELETE is rejected by the database (SQLSTATE 42501) no matter
-- which code path issues it. Prisma middleware, service guards and tRPC
-- validation remain as defence in depth, never as the guarantee.
--
-- Corrections are made by INSERTing a new row whose supersedes_id points at the
-- measurement being corrected.
--
-- The migration/owner role deliberately keeps every privilege on the table so
-- that later migrations can still alter it.

-- CreateRole
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'spm_app') THEN
    CREATE ROLE "spm_app" NOLOGIN;
  END IF;
END
$$;

-- Allow the owner/migration role to assume spm_app (SET ROLE) so that a
-- single-role deployment, and the integration test suite, can exercise the
-- application's real privilege set. Deployments that give the application its
-- own login role grant that role membership of spm_app instead.
DO $$
BEGIN
  EXECUTE format('GRANT "spm_app" TO %I', current_user);
END
$$;

-- GrantSchemaUsage
GRANT USAGE ON SCHEMA "public" TO "spm_app";
GRANT USAGE ON SCHEMA "iam" TO "spm_app";
GRANT USAGE ON SCHEMA "rules" TO "spm_app";
GRANT USAGE ON SCHEMA "audit" TO "spm_app";
GRANT USAGE ON SCHEMA "scheduling" TO "spm_app";
GRANT USAGE ON SCHEMA "strategy" TO "spm_app";
GRANT USAGE ON SCHEMA "registry" TO "spm_app";
GRANT USAGE ON SCHEMA "performance" TO "spm_app";

-- GrantTablePrivileges
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "public" TO "spm_app";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "iam" TO "spm_app";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "rules" TO "spm_app";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "audit" TO "spm_app";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "scheduling" TO "spm_app";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "strategy" TO "spm_app";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "registry" TO "spm_app";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "performance" TO "spm_app";

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "public" TO "spm_app";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "iam" TO "spm_app";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "rules" TO "spm_app";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "audit" TO "spm_app";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "scheduling" TO "spm_app";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "strategy" TO "spm_app";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "registry" TO "spm_app";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "performance" TO "spm_app";

-- Tables added by later migrations inherit the same baseline.
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "spm_app";
ALTER DEFAULT PRIVILEGES IN SCHEMA "iam" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "spm_app";
ALTER DEFAULT PRIVILEGES IN SCHEMA "rules" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "spm_app";
ALTER DEFAULT PRIVILEGES IN SCHEMA "audit" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "spm_app";
ALTER DEFAULT PRIVILEGES IN SCHEMA "scheduling" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "spm_app";
ALTER DEFAULT PRIVILEGES IN SCHEMA "strategy" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "spm_app";
ALTER DEFAULT PRIVILEGES IN SCHEMA "registry" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "spm_app";
ALTER DEFAULT PRIVILEGES IN SCHEMA "performance" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "spm_app";

-- RevokeMeasurementMutation
REVOKE ALL PRIVILEGES ON TABLE "performance"."measurements" FROM "spm_app";
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "performance"."measurements" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "performance"."measurements" TO "spm_app";
