import { describe, it, expect } from "vitest";
import { checkAuthRequirementsTool } from "../../src/tools/check-auth-requirements.js";

describe("check_auth_requirements", () => {
  it("returns an exact-match rule requiring prior auth (Scenario 2)", () => {
    const out = checkAuthRequirementsTool.run({
      procedure_code: "27447",
      diagnosis_group: "knee_osteoarthritis",
      plan_type: "MA-PPO",
      payer_id: "PAYER_MEDICARE_ADV_B",
    });
    expect(out.found).toBe(true);
    expect(out.matched).toBe(true);
    expect(out.auth_required).toBe(true);
    expect(out.decision_days).toBe(14);
    expect(out.criteria_list?.length).toBeGreaterThan(0);
  });

  it("reports no auth required for a routine office visit (Scenario 3)", () => {
    const out = checkAuthRequirementsTool.run({
      procedure_code: "99213",
      diagnosis_group: "acute_uri",
      plan_type: "PPO",
      payer_id: "PAYER_COMMERCIAL_A",
    });
    expect(out.found).toBe(true);
    expect(out.auth_required).toBe(false);
    expect(out.decision_days).toBe(0);
  });

  it("falls back to a procedure-level rule when plan_type does not match exactly", () => {
    const out = checkAuthRequirementsTool.run({
      procedure_code: "27447",
      diagnosis_group: "knee_osteoarthritis",
      plan_type: "SOME-OTHER-PLAN",
      payer_id: "PAYER_MEDICARE_ADV_B",
    });
    expect(out.found).toBe(true);
    expect(out.matched).toBe(false); // fallback, not an exact match
    expect(out.auth_required).toBe(true);
  });

  it("returns found:false for an unknown procedure/payer", () => {
    const out = checkAuthRequirementsTool.run({
      procedure_code: "11111",
      diagnosis_group: "x",
      plan_type: "PPO",
      payer_id: "PAYER_COMMERCIAL_A",
    });
    expect(out.found).toBe(false);
  });
});
