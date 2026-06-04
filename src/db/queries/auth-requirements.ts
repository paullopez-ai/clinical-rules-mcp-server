import type Database from "better-sqlite3";
import { getDb } from "../client.js";
import type { AuthRequirementResult } from "../../types/coverage.js";

interface AuthRow {
  procedure_code: string;
  diagnosis_group: string;
  plan_type: string;
  payer_id: string;
  payer_name: string;
  auth_required: number;
  criteria_list_json: string;
  decision_days: number;
}

/**
 * Resolve the authorization requirement for a procedure/diagnosis/plan against
 * a payer. Matching is tiered: an exact (procedure, diagnosis_group, plan_type)
 * match wins; otherwise the closest procedure+payer rule is returned so the
 * caller always gets a usable answer rather than a null.
 */
export function checkAuthRequirements(
  args: {
    procedure_code: string;
    diagnosis_group: string;
    plan_type: string;
    payer_id: string;
  },
  db: Database.Database = getDb(),
): AuthRequirementResult | null {
  const base = `SELECT ar.procedure_code, ar.diagnosis_group, ar.plan_type,
                       ar.payer_id, pp.payer_name, ar.auth_required,
                       ar.criteria_list_json, ar.decision_days
                  FROM auth_requirements ar
                  JOIN payer_profiles pp ON pp.payer_id = ar.payer_id
                 WHERE ar.procedure_code = ? AND ar.payer_id = ?`;

  // Tier 1: exact diagnosis_group + plan_type match.
  let row = db
    .prepare(`${base} AND ar.diagnosis_group = ? AND ar.plan_type = ?`)
    .get(
      args.procedure_code,
      args.payer_id,
      args.diagnosis_group,
      args.plan_type,
    ) as AuthRow | undefined;
  let matched = Boolean(row);

  // Tier 2: same diagnosis_group, any plan_type.
  if (!row) {
    row = db
      .prepare(`${base} AND ar.diagnosis_group = ?`)
      .get(args.procedure_code, args.payer_id, args.diagnosis_group) as
      | AuthRow
      | undefined;
  }

  // Tier 3: any rule for this procedure + payer.
  if (!row) {
    row = db.prepare(base).get(args.procedure_code, args.payer_id) as
      | AuthRow
      | undefined;
  }

  if (!row) return null;

  return {
    procedure_code: row.procedure_code,
    diagnosis_group: row.diagnosis_group,
    plan_type: row.plan_type,
    payer_id: row.payer_id,
    payer_name: row.payer_name,
    auth_required: Boolean(row.auth_required),
    criteria_list: JSON.parse(row.criteria_list_json) as string[],
    decision_days: row.decision_days,
    matched,
  };
}
