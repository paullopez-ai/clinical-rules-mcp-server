import { z } from "zod";
import type { ToolDefinition } from "../types/mcp.js";
import type { CoveragePolicyResult } from "../types/coverage.js";
import { getCoveragePolicy } from "../db/queries/coverage.js";

/**
 * get_coverage_policy — return the payer-specific coverage overlay for a CPT
 * code, joined to the federal NCD/LCD baseline it composes with (Skill 1,
 * Skill 6).
 *
 * The return is a typed contract (CoveragePolicyResult), not free text: a
 * consuming pipeline (e.g. Track 2 CoverageCheckNode) can read it without any
 * parsing or normalization layer.
 */

export interface GetCoveragePolicyInput {
  cpt_code: string;
  payer_id: string;
}

const inputShape = {
  cpt_code: z
    .string()
    .regex(/^[0-9]{4}[0-9A-Z]$/, "A 5-character CPT/HCPCS code, e.g. '27447'.")
    .describe(
      "The 5-character CPT or HCPCS procedure code to look up. Example: '27447' (total knee arthroplasty).",
    ),
  payer_id: z
    .string()
    .min(1)
    .describe(
      "The payer identifier whose overlay to apply. Example: 'PAYER_COMMERCIAL_A'. Use list_payers to enumerate valid ids.",
    ),
};

const coverageStatusSchema = z.enum([
  "covered_no_auth",
  "covered_with_prior_auth",
  "not_covered",
  "unknown",
]);

const outputShape = {
  found: z
    .boolean()
    .describe("False when no policy exists for this CPT/payer pair."),
  cpt_code: z.string(),
  payer_id: z.string(),
  payer_name: z.string().optional(),
  coverage_status: coverageStatusSchema.optional().describe(
    "Whether the procedure is covered and whether prior auth is required.",
  ),
  payer_overlay: z
    .record(z.unknown())
    .optional()
    .describe("Payer-specific overlay criteria layered on the federal baseline."),
  federal_baseline: z
    .object({
      ncd: z.unknown().nullable(),
      lcd: z.unknown().nullable(),
    })
    .optional()
    .describe("The CMS NCD/LCD documents this overlay composes with."),
  updated_at: z.string().optional(),
};

export interface GetCoveragePolicyOutput {
  found: boolean;
  cpt_code: string;
  payer_id: string;
  payer_name?: string;
  coverage_status?: CoveragePolicyResult["coverage_status"];
  payer_overlay?: CoveragePolicyResult["payer_overlay"];
  federal_baseline?: CoveragePolicyResult["federal_baseline"];
  updated_at?: string;
}

export const getCoveragePolicyTool = {
  name: "get_coverage_policy",
  config: {
    title: "Get coverage policy",
    description:
      "Retrieve the payer-specific coverage policy for a CPT code, assembled with the federal CMS NCD/LCD baseline it layers on top of. Returns coverage status (covered_no_auth | covered_with_prior_auth | not_covered | unknown), the payer overlay criteria, and the federal documents. This supplies the payer-overlay layer that the Anthropic CMS Connector does not cover; an agent should call both. Requires no API key.",
    inputSchema: inputShape,
    outputSchema: outputShape,
  },
  run(input: GetCoveragePolicyInput): GetCoveragePolicyOutput {
    const result = getCoveragePolicy(input.cpt_code, input.payer_id);
    if (!result) {
      return {
        found: false,
        cpt_code: input.cpt_code,
        payer_id: input.payer_id,
      };
    }
    return { found: true, ...result };
  },
} satisfies ToolDefinition<GetCoveragePolicyInput, GetCoveragePolicyOutput>;
