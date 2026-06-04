import { describe, it, expect } from "vitest";
import { flagDocumentationGapsTool } from "../../src/tools/flag-documentation-gaps.js";

describe("flag_documentation_gaps (MOCK_LLM=true)", () => {
  it("never calls a live model in tests", async () => {
    const out = await flagDocumentationGapsTool.run({
      clinical_notes: "Imaging shows joint-space narrowing.",
      procedure_code: "27447",
      payer_id: "PAYER_MEDICARE_ADV_B",
    });
    expect(out.analysis_source).toBe("mock");
  });

  it("flags a blocking gap for missing conservative therapy (Scenario 2)", async () => {
    const out = await flagDocumentationGapsTool.run({
      clinical_notes:
        "Patient with right knee osteoarthritis. X-ray confirms severe joint-space narrowing. Requesting TKA.",
      procedure_code: "27447",
      payer_id: "PAYER_MEDICARE_ADV_B",
    });
    expect(out.has_blocking_gaps).toBe(true);
    expect(out.completeness_score).toBeLessThan(80);
    expect(out.gaps.some((g) => g.severity === "blocking")).toBe(true);
    // Every gap carries concrete suggested chart language.
    for (const gap of out.gaps) {
      expect(gap.suggested_language.length).toBeGreaterThan(0);
      expect(["blocking", "advisory"]).toContain(gap.severity);
    }
  });

  it("reports a clean record with no blocking gaps (Scenario 3)", async () => {
    const out = await flagDocumentationGapsTool.run({
      clinical_notes:
        "Established patient, sore throat. History, exam, and low-complexity MDM documented.",
      procedure_code: "99213",
      payer_id: "PAYER_COMMERCIAL_A",
    });
    expect(out.has_blocking_gaps).toBe(false);
    expect(out.completeness_score).toBeGreaterThanOrEqual(90);
    expect(out.gaps.length).toBe(0);
  });

  it("clamps completeness_score to the 0-100 range", async () => {
    const out = await flagDocumentationGapsTool.run({
      clinical_notes: "n/a",
      procedure_code: "99213",
      payer_id: "PAYER_COMMERCIAL_A",
    });
    expect(out.completeness_score).toBeGreaterThanOrEqual(0);
    expect(out.completeness_score).toBeLessThanOrEqual(100);
  });
});
