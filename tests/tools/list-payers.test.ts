import { describe, it, expect } from "vitest";
import { listPayersTool } from "../../src/tools/list-payers.js";

describe("list_payers", () => {
  it("returns all seeded synthetic payers", () => {
    const out = listPayersTool.run();
    expect(out.count).toBe(3);
    const ids = out.payers.map((p) => p.payer_id).sort();
    expect(ids).toEqual([
      "PAYER_COMMERCIAL_A",
      "PAYER_MEDICAID_C",
      "PAYER_MEDICARE_ADV_B",
    ]);
  });

  it("parses JSON array columns into typed arrays", () => {
    const out = listPayersTool.run();
    const commercial = out.payers.find((p) => p.payer_id === "PAYER_COMMERCIAL_A");
    expect(commercial?.plan_types).toContain("PPO");
    expect(Array.isArray(commercial?.cpt_domains)).toBe(true);
    expect(typeof commercial?.cms_baseline_override).toBe("boolean");
  });
});
