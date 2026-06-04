/**
 * Seed the synthetic payer overlay layer: payer profiles, coverage policies,
 * authorization requirements, and documentation criteria.
 *
 * All data here is clearly-labeled synthetic (PRD Section 3.1). It models the
 * payer-specific criteria that sit on top of the federal CMS baseline — the
 * layer Anthropic's CMS Connector is not designed to supply.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getDb, closeDb } from "../src/db/client.js";
import { hasChanged } from "./seed-utils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataFile = resolve(__dirname, "../data/synthetic-payers.json");

interface PayerSeed {
  payer_id: string;
  payer_name: string;
  plan_types: string[];
  cpt_domains: string[];
  cms_baseline_override: boolean;
  coverage_policies: Array<{
    cpt_code: string;
    coverage_status: string;
    ncd_id: string | null;
    lcd_id: string | null;
    criteria: Record<string, unknown>;
  }>;
  auth_requirements: Array<{
    procedure_code: string;
    diagnosis_group: string;
    plan_type: string;
    auth_required: boolean;
    criteria_list: string[];
    decision_days: number;
  }>;
  documentation_criteria: Array<{
    criteria_id: string;
    procedure_code: string;
    required_elements: string[];
    blocking_elements: string[];
  }>;
}

function seed(): void {
  const db = getDb();
  const { payers } = JSON.parse(readFileSync(dataFile, "utf8")) as {
    payers: PayerSeed[];
  };
  const now = new Date().toISOString();

  const upsertPayer = db.prepare(
    `INSERT INTO payer_profiles (payer_id, payer_name, plan_types, cpt_domains, cms_baseline_override)
       VALUES (@payer_id, @payer_name, @plan_types, @cpt_domains, @cms_baseline_override)
       ON CONFLICT(payer_id) DO UPDATE SET
         payer_name=excluded.payer_name, plan_types=excluded.plan_types,
         cpt_domains=excluded.cpt_domains, cms_baseline_override=excluded.cms_baseline_override`,
  );

  const upsertCoverage = db.prepare(
    `INSERT INTO coverage_policies (cpt_code, payer_id, coverage_status, ncd_id, lcd_id, criteria_json, updated_at)
       VALUES (@cpt_code, @payer_id, @coverage_status, @ncd_id, @lcd_id, @criteria_json, @updated_at)
       ON CONFLICT(cpt_code, payer_id) DO UPDATE SET
         coverage_status=excluded.coverage_status, ncd_id=excluded.ncd_id,
         lcd_id=excluded.lcd_id, criteria_json=excluded.criteria_json,
         updated_at=excluded.updated_at`,
  );

  const upsertAuth = db.prepare(
    `INSERT INTO auth_requirements (procedure_code, diagnosis_group, plan_type, payer_id, auth_required, criteria_list_json, decision_days)
       VALUES (@procedure_code, @diagnosis_group, @plan_type, @payer_id, @auth_required, @criteria_list_json, @decision_days)
       ON CONFLICT(procedure_code, diagnosis_group, plan_type, payer_id) DO UPDATE SET
         auth_required=excluded.auth_required, criteria_list_json=excluded.criteria_list_json,
         decision_days=excluded.decision_days`,
  );

  const upsertDoc = db.prepare(
    `INSERT INTO documentation_criteria (criteria_id, payer_id, procedure_code, required_elements_json, blocking_elements_json)
       VALUES (@criteria_id, @payer_id, @procedure_code, @required_elements_json, @blocking_elements_json)
       ON CONFLICT(criteria_id) DO UPDATE SET
         payer_id=excluded.payer_id, procedure_code=excluded.procedure_code,
         required_elements_json=excluded.required_elements_json,
         blocking_elements_json=excluded.blocking_elements_json`,
  );

  let payerWrites = 0;
  let coverageWrites = 0;
  let authWrites = 0;
  let docWrites = 0;

  const run = db.transaction(() => {
    for (const p of payers) {
      if (hasChanged(db, `payer:${p.payer_id}`, p)) {
        upsertPayer.run({
          payer_id: p.payer_id,
          payer_name: p.payer_name,
          plan_types: JSON.stringify(p.plan_types),
          cpt_domains: JSON.stringify(p.cpt_domains),
          cms_baseline_override: p.cms_baseline_override ? 1 : 0,
        });
        payerWrites++;
      }

      for (const c of p.coverage_policies) {
        const key = `coverage:${p.payer_id}:${c.cpt_code}`;
        if (hasChanged(db, key, c)) {
          upsertCoverage.run({
            cpt_code: c.cpt_code,
            payer_id: p.payer_id,
            coverage_status: c.coverage_status,
            ncd_id: c.ncd_id,
            lcd_id: c.lcd_id,
            criteria_json: JSON.stringify(c.criteria),
            updated_at: now,
          });
          coverageWrites++;
        }
      }

      for (const a of p.auth_requirements) {
        const key = `auth:${p.payer_id}:${a.procedure_code}:${a.diagnosis_group}:${a.plan_type}`;
        if (hasChanged(db, key, a)) {
          upsertAuth.run({
            procedure_code: a.procedure_code,
            diagnosis_group: a.diagnosis_group,
            plan_type: a.plan_type,
            payer_id: p.payer_id,
            auth_required: a.auth_required ? 1 : 0,
            criteria_list_json: JSON.stringify(a.criteria_list),
            decision_days: a.decision_days,
          });
          authWrites++;
        }
      }

      for (const d of p.documentation_criteria) {
        if (hasChanged(db, `doc:${d.criteria_id}`, d)) {
          upsertDoc.run({
            criteria_id: d.criteria_id,
            payer_id: p.payer_id,
            procedure_code: d.procedure_code,
            required_elements_json: JSON.stringify(d.required_elements),
            blocking_elements_json: JSON.stringify(d.blocking_elements),
          });
          docWrites++;
        }
      }
    }
  });
  run();

  console.log(
    `[seed-synthetic-payers] payers:${payerWrites} coverage:${coverageWrites} ` +
      `auth:${authWrites} docs:${docWrites} written (unchanged records skipped).`,
  );
  closeDb();
}

seed();
