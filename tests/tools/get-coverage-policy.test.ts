import { describe, it, expect } from "vitest";
import { getCoveragePolicyTool } from "../../src/tools/get-coverage-policy.js";

describe("get_coverage_policy", () => {
  it("returns the payer overlay joined to the federal NCD/LCD baseline (Scenario 1)", () => {
    const out = getCoveragePolicyTool.run({
      cpt_code: "27447",
      payer_id: "PAYER_COMMERCIAL_A",
    });
    expect(out.found).toBe(true);
    expect(out.coverage_status).toBe("covered_with_prior_auth");
    // Payer-specific overlay layer.
    expect(out.payer_overlay?.conservative_therapy_weeks_required).toBe(12);
    // Federal baseline composed in.
    expect(out.federal_baseline?.lcd).not.toBeNull();
    expect((out.federal_baseline?.lcd as { lcd_id: string }).lcd_id).toBe("L33456");
    expect(out.federal_baseline?.ncd).not.toBeNull();
  });

  it("applies a stricter overlay for the Medicare Advantage payer", () => {
    const out = getCoveragePolicyTool.run({
      cpt_code: "27447",
      payer_id: "PAYER_MEDICARE_ADV_B",
    });
    expect(out.payer_overlay?.conservative_therapy_weeks_required).toBe(24);
  });

  it("returns found:false for an unknown CPT/payer pair", () => {
    const out = getCoveragePolicyTool.run({
      cpt_code: "00000",
      payer_id: "PAYER_COMMERCIAL_A",
    });
    expect(out.found).toBe(false);
    expect(out.coverage_status).toBeUndefined();
  });
});
