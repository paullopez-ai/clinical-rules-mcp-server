import type Database from "better-sqlite3";
import { getDb } from "../client.js";
import type {
  CoverageCriteria,
  CoveragePolicyResult,
  CoverageStatus,
  LcdDocument,
  NcdDocument,
  Payer,
} from "../../types/coverage.js";

/**
 * Targeted coverage lookup (Skill 6). A single indexed query assembles the
 * exact context slice for one CPT/payer pair by joining the payer overlay to
 * the federal NCD/LCD baseline it sits on top of. No full-table scans.
 */
interface CoverageRow {
  cpt_code: string;
  payer_id: string;
  payer_name: string;
  coverage_status: string;
  criteria_json: string;
  updated_at: string;
  ncd_id: string | null;
  lcd_id: string | null;
}

export function getCoveragePolicy(
  cptCode: string,
  payerId: string,
  db: Database.Database = getDb(),
): CoveragePolicyResult | null {
  const row = db
    .prepare(
      `SELECT cp.cpt_code, cp.payer_id, pp.payer_name, cp.coverage_status,
              cp.criteria_json, cp.updated_at, cp.ncd_id, cp.lcd_id
         FROM coverage_policies cp
         JOIN payer_profiles pp ON pp.payer_id = cp.payer_id
        WHERE cp.cpt_code = ? AND cp.payer_id = ?`,
    )
    .get(cptCode, payerId) as CoverageRow | undefined;

  if (!row) return null;

  const ncd = row.ncd_id ? getNcd(row.ncd_id, db) : null;
  const lcd = row.lcd_id ? getLcd(row.lcd_id, db) : null;

  return {
    cpt_code: row.cpt_code,
    payer_id: row.payer_id,
    payer_name: row.payer_name,
    coverage_status: row.coverage_status as CoverageStatus,
    payer_overlay: JSON.parse(row.criteria_json) as CoverageCriteria,
    federal_baseline: { ncd, lcd },
    updated_at: row.updated_at,
  };
}

export function getNcd(
  ncdId: string,
  db: Database.Database = getDb(),
): NcdDocument | null {
  const row = db
    .prepare(`SELECT * FROM ncd_documents WHERE ncd_id = ?`)
    .get(ncdId) as
    | (Omit<NcdDocument, never> & Record<string, unknown>)
    | undefined;
  return row ? (row as unknown as NcdDocument) : null;
}

export function getLcd(
  lcdId: string,
  db: Database.Database = getDb(),
): LcdDocument | null {
  const row = db.prepare(`SELECT * FROM lcd_documents WHERE lcd_id = ?`).get(
    lcdId,
  ) as { states_covered: string } & Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    lcd_id: row.lcd_id as string,
    contractor_name: row.contractor_name as string,
    title: row.title as string,
    effective_date: row.effective_date as string,
    summary: row.summary as string,
    states_covered: JSON.parse(row.states_covered) as string[],
  };
}

/** List every payer in the knowledge store (catalog-level scope). */
export function listPayers(db: Database.Database = getDb()): Payer[] {
  const rows = db
    .prepare(`SELECT * FROM payer_profiles ORDER BY payer_id`)
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    payer_id: r.payer_id as string,
    payer_name: r.payer_name as string,
    plan_types: JSON.parse(r.plan_types as string) as string[],
    cpt_domains: JSON.parse(r.cpt_domains as string) as string[],
    cms_baseline_override: Boolean(r.cms_baseline_override),
  }));
}
