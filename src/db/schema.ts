import type Database from "better-sqlite3";

/**
 * SQLite knowledge-store schema (Postgres-compatible DDL).
 *
 * The schema deliberately separates two scopes (Skill 6 — Context
 * Architecture):
 *
 *   Catalog-level knowledge   → ncd_documents, lcd_documents, payer_profiles
 *   Request-level context     → coverage_policies, auth_requirements,
 *                               documentation_criteria
 *
 * A tool retrieves from the correct scope for the question being asked, so the
 * context handed to an agent (or to Claude inside flag_documentation_gaps) is
 * the precise slice for one CPT/diagnosis/plan combination — never a full
 * table scan and never the whole knowledge base.
 *
 * Every column type below is valid in both SQLite and Postgres. The only
 * Postgres-specific note: booleans are stored as INTEGER 0/1 in SQLite; a
 * production Postgres deployment would use BOOLEAN with no other change.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ncd_documents (
  ncd_id        TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  summary       TEXT NOT NULL,
  full_text_url TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lcd_documents (
  lcd_id          TEXT PRIMARY KEY,
  contractor_name TEXT NOT NULL,
  title           TEXT NOT NULL,
  effective_date  TEXT NOT NULL,
  summary         TEXT NOT NULL,
  states_covered  TEXT NOT NULL  -- JSON array
);

CREATE TABLE IF NOT EXISTS payer_profiles (
  payer_id              TEXT PRIMARY KEY,
  payer_name            TEXT NOT NULL,
  plan_types            TEXT NOT NULL,  -- JSON array
  cpt_domains           TEXT NOT NULL,  -- JSON array
  cms_baseline_override INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS coverage_policies (
  cpt_code        TEXT NOT NULL,
  payer_id        TEXT NOT NULL,
  coverage_status TEXT NOT NULL,
  ncd_id          TEXT,
  lcd_id          TEXT,
  criteria_json   TEXT NOT NULL,  -- JSON object (CoverageCriteria)
  updated_at      TEXT NOT NULL,
  PRIMARY KEY (cpt_code, payer_id),
  FOREIGN KEY (payer_id) REFERENCES payer_profiles(payer_id),
  FOREIGN KEY (ncd_id)   REFERENCES ncd_documents(ncd_id),
  FOREIGN KEY (lcd_id)   REFERENCES lcd_documents(lcd_id)
);

CREATE TABLE IF NOT EXISTS auth_requirements (
  procedure_code     TEXT NOT NULL,
  diagnosis_group    TEXT NOT NULL,
  plan_type          TEXT NOT NULL,
  payer_id           TEXT NOT NULL,
  auth_required      INTEGER NOT NULL DEFAULT 0,
  criteria_list_json TEXT NOT NULL,  -- JSON array
  decision_days      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (procedure_code, diagnosis_group, plan_type, payer_id),
  FOREIGN KEY (payer_id) REFERENCES payer_profiles(payer_id)
);

CREATE TABLE IF NOT EXISTS documentation_criteria (
  criteria_id            TEXT PRIMARY KEY,
  payer_id               TEXT NOT NULL,
  procedure_code         TEXT NOT NULL,
  required_elements_json TEXT NOT NULL,  -- JSON array
  blocking_elements_json TEXT NOT NULL,  -- JSON array
  FOREIGN KEY (payer_id) REFERENCES payer_profiles(payer_id)
);

CREATE INDEX IF NOT EXISTS idx_coverage_cpt ON coverage_policies(cpt_code);
CREATE INDEX IF NOT EXISTS idx_auth_proc ON auth_requirements(procedure_code, payer_id);
CREATE INDEX IF NOT EXISTS idx_doc_proc ON documentation_criteria(procedure_code, payer_id);

-- Incremental-ingestion bookkeeping: maps a record key to a content hash so
-- the seed scripts re-index only changed records (Skill 6 evidence).
CREATE TABLE IF NOT EXISTS _seed_hashes (
  record_key   TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL
);
`;

/** Create all tables and indexes if they do not already exist. */
export function initSchema(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
}
