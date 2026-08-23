ALTER TYPE strategy."StagedChangeKind" ADD VALUE 'hierarchy_import';

CREATE TYPE strategy."PortfolioHierarchyImportFormat" AS ENUM ('csv', 'json');
CREATE TYPE strategy."PortfolioHierarchyImportStatus" AS ENUM ('dry_run', 'submitted', 'applied');

CREATE TABLE strategy.portfolio_hierarchy_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  plan_version_id UUID NOT NULL,
  source_format strategy."PortfolioHierarchyImportFormat" NOT NULL,
  source_file_name TEXT,
  source_checksum TEXT NOT NULL,
  normalized_input JSONB NOT NULL,
  initial_diff JSONB NOT NULL,
  resolutions JSONB NOT NULL DEFAULT '{}'::jsonb,
  status strategy."PortfolioHierarchyImportStatus" NOT NULL DEFAULT 'dry_run',
  staged_change_id UUID,
  approval_case_id UUID,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TIMESTAMP(3),
  applied_at TIMESTAMP(3),
  CONSTRAINT portfolio_hierarchy_imports_pkey PRIMARY KEY (id),
  CONSTRAINT portfolio_hierarchy_imports_plan_version_id_fkey FOREIGN KEY (plan_version_id) REFERENCES strategy.plan_versions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT portfolio_hierarchy_imports_staged_change_id_fkey FOREIGN KEY (staged_change_id) REFERENCES strategy.staged_changes(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT portfolio_hierarchy_imports_approval_case_id_fkey FOREIGN KEY (approval_case_id) REFERENCES governance.approval_cases(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT portfolio_hierarchy_imports_created_by_fkey FOREIGN KEY (created_by) REFERENCES iam.users(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX portfolio_hierarchy_imports_staged_change_id_key ON strategy.portfolio_hierarchy_imports(staged_change_id);
CREATE INDEX portfolio_hierarchy_imports_plan_version_id_status_idx ON strategy.portfolio_hierarchy_imports(plan_version_id, status);
CREATE INDEX portfolio_hierarchy_imports_created_by_created_at_idx ON strategy.portfolio_hierarchy_imports(created_by, created_at);
CREATE INDEX portfolio_hierarchy_imports_approval_case_id_idx ON strategy.portfolio_hierarchy_imports(approval_case_id);
