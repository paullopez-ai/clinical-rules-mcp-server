import type Database from "better-sqlite3";
import { getDb } from "../client.js";

/** The criteria slice needed to evaluate documentation for one procedure/payer. */
export interface DocumentationCriteria {
  criteria_id: string;
  payer_id: string;
  procedure_code: string;
  required_elements: string[];
  blocking_elements: string[];
}

/**
 * Retrieve only the documentation criteria for one procedure/payer pair
 * (Skill 6). flag_documentation_gaps passes exactly this slice to Claude — the
 * token budget is capped at the criteria for the request, not the whole store.
 */
export function getDocumentationCriteria(
  procedureCode: string,
  payerId: string,
  db: Database.Database = getDb(),
): DocumentationCriteria | null {
  const row = db
    .prepare(
      `SELECT * FROM documentation_criteria
        WHERE procedure_code = ? AND payer_id = ?`,
    )
    .get(procedureCode, payerId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    criteria_id: row.criteria_id as string,
    payer_id: row.payer_id as string,
    procedure_code: row.procedure_code as string,
    required_elements: JSON.parse(row.required_elements_json as string) as string[],
    blocking_elements: JSON.parse(row.blocking_elements_json as string) as string[],
  };
}
