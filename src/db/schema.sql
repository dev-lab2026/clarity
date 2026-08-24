-- ====================================================================
-- CLARITY PM ENTERPRISE — POSTGRESQL PRODUCTION DATABASE SCHEMA
-- Multi-Project Cockpit, EVM Performance, WBS, RBAC & Azure AD Sync
-- ====================================================================

-- Enable UUID extension for robust distributed identifiers
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------------------------
-- 1. ENUMS & DOMAINS
-- --------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role_enum AS ENUM (
    'DIRECTEUR_PROJETS', 
    'CHEF_PROJET', 
    'PMO', 
    'CONTRIBUTEUR', 
    'ADMINISTRATEUR'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE project_status_enum AS ENUM (
    'PLANNING', 
    'IN_PROGRESS', 
    'ON_HOLD', 
    'COMPLETED', 
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE project_health_enum AS ENUM (
    'HEALTHY', 
    'WARNING', 
    'CRITICAL'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE priority_enum AS ENUM (
    'LOW', 
    'MEDIUM', 
    'HIGH', 
    'CRITICAL'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE task_status_enum AS ENUM (
    'TODO', 
    'IN_PROGRESS', 
    'REVIEW', 
    'DONE', 
    'BLOCKED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE risk_severity_enum AS ENUM (
    'LOW', 
    'MEDIUM', 
    'HIGH', 
    'CRITICAL'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE risk_status_enum AS ENUM (
    'IDENTIFIED', 
    'ANALYZING', 
    'MITIGATING', 
    'CLOSED', 
    'OCCURRED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- --------------------------------------------------------------------
-- 2. USERS & PROFILES (Linked with Microsoft Entra ID / Active Directory)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  role user_role_enum NOT NULL DEFAULT 'CHEF_PROJET',
  job_title VARCHAR(150),
  department VARCHAR(150),
  office_location VARCHAR(150),
  avatar_url TEXT,
  azure_oid VARCHAR(128) UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- --------------------------------------------------------------------
-- 3. PROJECTS (Created & Governed by Directeur de Projets)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(32) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  client VARCHAR(255) NOT NULL DEFAULT 'Direction Générale',
  status project_status_enum NOT NULL DEFAULT 'IN_PROGRESS',
  health project_health_enum NOT NULL DEFAULT 'HEALTHY',
  priority priority_enum NOT NULL DEFAULT 'HIGH',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  budget_bac NUMERIC(14, 2) NOT NULL DEFAULT 0.00, -- Budget at Completion
  currency VARCHAR(8) NOT NULL DEFAULT 'EUR',
  director_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL, -- Responsable Directeur de Projets
  project_manager_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL, -- Chef de Projet assigné
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_director ON projects(director_id);
CREATE INDEX IF NOT EXISTS idx_projects_pm ON projects(project_manager_id);

-- --------------------------------------------------------------------
-- 4. PROJECT MILESTONES (Jalons Clés du Projet)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_milestones (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  target_date DATE NOT NULL,
  completed_date DATE,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  weight NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestones_project ON project_milestones(project_id);

-- --------------------------------------------------------------------
-- 5. TEAM MEMBERS & RESOURCES (Allocated by Directeur de Projets)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_members (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) REFERENCES projects(id) ON DELETE CASCADE,
  user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  daily_rate_tjm NUMERIC(10, 2) NOT NULL DEFAULT 650.00, -- Taux Journalier Moyen
  capacity_hours_per_week NUMERIC(5, 2) NOT NULL DEFAULT 35.00,
  allocated_tasks_count INTEGER NOT NULL DEFAULT 0,
  department VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_project ON team_members(project_id);
CREATE INDEX IF NOT EXISTS idx_team_email ON team_members(email);

-- --------------------------------------------------------------------
-- 6. TASKS & WBS (Work Breakdown Structure)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  wbs_code VARCHAR(32) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 1,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  planned_cost_pv NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Planned Value
  actual_cost_ac NUMERIC(12, 2) NOT NULL DEFAULT 0.00,  -- Actual Cost
  earned_value_ev NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Earned Value (PV * Progress)
  status task_status_enum NOT NULL DEFAULT 'TODO',
  priority priority_enum NOT NULL DEFAULT 'MEDIUM',
  assignee_id VARCHAR(64) REFERENCES team_members(id) ON DELETE SET NULL,
  assignee_name VARCHAR(255),
  dependencies TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_wbs ON tasks(project_id, wbs_code);

-- --------------------------------------------------------------------
-- 7. RISKS REGISTER (Registre & Matrice des Risques)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risks (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(64) NOT NULL DEFAULT 'TECHNIQUE',
  probability INTEGER NOT NULL CHECK (probability >= 1 AND probability <= 5),
  impact INTEGER NOT NULL CHECK (impact >= 1 AND impact <= 5),
  score INTEGER GENERATED ALWAYS AS (probability * impact) STORED,
  severity risk_severity_enum NOT NULL DEFAULT 'MEDIUM',
  status risk_status_enum NOT NULL DEFAULT 'IDENTIFIED',
  owner VARCHAR(255) NOT NULL,
  mitigation_plan TEXT,
  contingency_plan TEXT,
  financial_impact NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risks_project ON risks(project_id);
CREATE INDEX IF NOT EXISTS idx_risks_severity ON risks(severity);

-- --------------------------------------------------------------------
-- 8. EVM PERFORMANCE SNAPSHOTS (Historique des indicateurs de valeur acquise)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evm_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  planned_value_pv NUMERIC(14, 2) NOT NULL,
  earned_value_ev NUMERIC(14, 2) NOT NULL,
  actual_cost_ac NUMERIC(14, 2) NOT NULL,
  budget_at_completion_bac NUMERIC(14, 2) NOT NULL,
  cost_variance_cv NUMERIC(14, 2) NOT NULL,
  schedule_variance_sv NUMERIC(14, 2) NOT NULL,
  cpi NUMERIC(6, 3) NOT NULL,
  spi NUMERIC(6, 3) NOT NULL,
  eac NUMERIC(14, 2) NOT NULL,
  vac NUMERIC(14, 2) NOT NULL,
  tcpi NUMERIC(6, 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_evm_project_date ON evm_snapshots(project_id, snapshot_date DESC);

-- --------------------------------------------------------------------
-- 9. AUDIT LOGS & TRACEABILITY (Conformité & Sécurité)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(64),
  user_email VARCHAR(255),
  user_role VARCHAR(64),
  action VARCHAR(64) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(64),
  details JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);

-- --------------------------------------------------------------------
-- 10. SYSTEM SETTINGS & INTEGRATIONS CONFIG
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(128) PRIMARY KEY,
  value_json JSONB NOT NULL,
  description TEXT,
  updated_by VARCHAR(64),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------------------------------
-- 11. MATERIALIZED / HELPER VIEWS FOR PM COCKPIT & DIRECTEUR DE PROJETS
-- --------------------------------------------------------------------
CREATE OR REPLACE VIEW view_portfolio_summary AS
SELECT 
  p.id AS project_id,
  p.code,
  p.name,
  p.client,
  p.status,
  p.health,
  p.priority,
  p.start_date,
  p.end_date,
  p.budget_bac,
  COALESCE(u_dir.display_name, 'Directeur Non Assigne') AS director_name,
  COALESCE(u_pm.display_name, 'Chef de Projet Non Assigne') AS pm_name,
  COUNT(DISTINCT t.id) AS total_tasks,
  COUNT(DISTINCT CASE WHEN t.status = 'DONE' THEN t.id END) AS completed_tasks,
  COALESCE(AVG(t.progress), 0)::NUMERIC(5,2) AS avg_progress_percent,
  COALESCE(SUM(t.planned_cost_pv), 0) AS total_pv,
  COALESCE(SUM(t.earned_value_ev), 0) AS total_ev,
  COALESCE(SUM(t.actual_cost_ac), 0) AS total_ac,
  CASE 
    WHEN COALESCE(SUM(t.actual_cost_ac), 0) > 0 THEN 
      ROUND((SUM(t.earned_value_ev) / SUM(t.actual_cost_ac))::NUMERIC, 3) 
    ELSE 1.000 
  END AS cpi,
  CASE 
    WHEN COALESCE(SUM(t.planned_cost_pv), 0) > 0 THEN 
      ROUND((SUM(t.earned_value_ev) / SUM(t.planned_cost_pv))::NUMERIC, 3) 
    ELSE 1.000 
  END AS spi,
  COUNT(DISTINCT r.id) AS total_risks,
  COUNT(DISTINCT CASE WHEN r.severity = 'CRITICAL' THEN r.id END) AS critical_risks
FROM projects p
LEFT JOIN users u_dir ON p.director_id = u_dir.id
LEFT JOIN users u_pm ON p.project_manager_id = u_pm.id
LEFT JOIN tasks t ON p.id = t.project_id
LEFT JOIN risks r ON p.id = r.project_id
GROUP BY p.id, p.code, p.name, p.client, p.status, p.health, p.priority, p.start_date, p.end_date, p.budget_bac, u_dir.display_name, u_pm.display_name;

-- --------------------------------------------------------------------
-- 12. INITIAL SEED DATA FOR PRODUCTION READY LAUNCH
-- --------------------------------------------------------------------
INSERT INTO users (id, email, display_name, role, job_title, department)
VALUES 
  ('usr-dir-01', 'directeur.projets@entreprise.fr', 'Marc Lefevre', 'DIRECTEUR_PROJETS', 'Directeur de Projets & Transformation', 'Direction des Projets'),
  ('usr-pm-01', 'alexandre.dupont@entreprise.fr', 'Alexandre Dupont', 'CHEF_PROJET', 'Chef de Projet Senior (PMP)', 'Pole Digital & Cloud'),
  ('usr-pmo-01', 'claire.bernard@entreprise.fr', 'Claire Bernard', 'PMO', 'Directrice PMO & Portfolio', 'Gouvernance & PMO'),
  ('usr-admin-01', 'admin.clarity@entreprise.fr', 'Administrateur Systeme', 'ADMINISTRATEUR', 'Lead Architect & DevOps', 'Infrastructure & SecOps')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE projects IS 'Table principale des projets geres dans le cockpit Clarity PM';
COMMENT ON TABLE tasks IS 'Grille WBS et taches avec calculs Earned Value Management (PV, EV, AC)';
COMMENT ON TABLE risks IS 'Registre des risques avec scoring automatique probabilite x impact';
COMMENT ON VIEW view_portfolio_summary IS 'Vue consolidee du portefeuille de projets pour la Direction de Projets et le PMO';

-- Application persistence for the current TypeScript domain model.
CREATE TABLE IF NOT EXISTS project_documents (
  id VARCHAR(128) PRIMARY KEY,
  document JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_audit_logs (
  id UUID PRIMARY KEY,
  user_id VARCHAR(128),
  user_email VARCHAR(320),
  user_role VARCHAR(64),
  action VARCHAR(128) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(128),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_audit_logs_created_at ON app_audit_logs(created_at DESC);
