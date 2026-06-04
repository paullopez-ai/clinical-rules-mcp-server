import { describe, it, expect } from "vitest";
import {
  runScenario,
  SCENARIO_2_DENIAL,
  SCENARIO_3_CLEAN,
  HUMAN_REVIEW_THRESHOLD,
} from "../../demo/track-2-langgraph/pipeline.js";

/**
 * Integration test — the full Track 2 pipeline composing all four tools with
 * MOCK_LLM=true. Exercises the two-layer merge, the gap audit, the confidence
 * routing, and the HumanReviewNode trust boundary in one run.
 */
describe("Scenario 2 — full pipeline (MOCK_LLM=true)", () => {
  it("denial path: low confidence fires HumanReviewNode and reviewer denial sticks", async () => {
    const res = await runScenario(SCENARIO_2_DENIAL, "deny");

    // Two-layer composition produced both attribution buckets.
    expect(res.determination.attribution.federal_baseline.length).toBeGreaterThan(0);
    expect(res.determination.attribution.payer_overlay.length).toBeGreaterThan(0);

    // Documentation audit found a blocking gap → low confidence.
    expect(res.determination.confidence).toBeCloseTo(0.62, 2);
    expect(res.determination.confidence).toBeLessThan(HUMAN_REVIEW_THRESHOLD);

    // Trust boundary fired and the human decision was applied.
    expect(res.interrupted).toBe(true);
    expect(res.determination.status).toBe("denied");
    expect(res.determination.attribution.documentation_gaps.some((g) => g.startsWith("[blocking]"))).toBe(true);
  });

  it("clean path: high confidence is auto-approved with no HumanReviewNode", async () => {
    const res = await runScenario(SCENARIO_3_CLEAN, "approve");
    expect(res.determination.confidence).toBeCloseTo(0.91, 2);
    expect(res.determination.confidence).toBeGreaterThanOrEqual(HUMAN_REVIEW_THRESHOLD);
    expect(res.interrupted).toBe(false);
    expect(res.determination.status).toBe("approved");
  });

  it("includes a timestamp and rationale on every determination (audit trail)", async () => {
    const res = await runScenario(SCENARIO_3_CLEAN);
    expect(res.determination.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.determination.rationale.length).toBeGreaterThan(0);
  });
});
