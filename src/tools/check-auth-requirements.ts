import { z } from "zod";
import type { ToolDefinition } from "../types/mcp.js";
import type { AuthRequirementResult } from "../types/coverage.js";
import { checkAuthRequirements } from "../db/queries/auth-requirements.js";

/**
 * check_auth_requirements — answer "does this payer require prior auth for this
 * procedure/diagnosis/plan, and if so against what criteria?" (Skill 1,
 * Skill 6).
 */

export interface CheckAuthRequirementsInput {
  procedure_code: string;
  diagnosis_group: string;
  plan_type: string;
  payer_id: string;
}

const inputShape = {
  procedure_code: z
    .string()
    .regex(/^[0-9]{4}[0-9A-Z]$/)
    .describe("The 5-character CPT/HCPCS procedure code. Example: '27447'."),
  diagnosis_group: z
    .string()
    .min(1)
    .describe(
      "A clinical diagnosis grouping for the request. Example: 'knee_osteoarthritis'. Maps an ICD-10 family (e.g. M17.x) to the criteria set, rather than requiring an exact code.",
    ),
  plan_type: z
    .string()
    .min(1)
    .describe(
      "The plan type the member is enrolled in. Example: 'PPO', 'MA-PPO', 'Medicaid-MCO'.",
    ),
  payer_id: z
    .string()
    .min(1)
    .describe("The payer identifier. Example: 'PAYER_MEDICARE_ADV_B'."),
};

const outputShape = {
  found: z.boolean().describe("False when no rule exists for this procedure/payer."),
  matched: z
    .boolean()
    .optional()
    .describe(
      "True only when an exact diagnosis_group + plan_type rule was found; false means a fallback rule for the procedure/payer was returned.",
    ),
  procedure_code: z.string(),
  payer_id: z.string(),
  payer_name: z.string().optional(),
  diagnosis_group: z.string().optional(),
  plan_type: z.string().optional(),
  auth_required: z
    .boolean()
    .optional()
    .describe("Whether prior authorization is required."),
  criteria_list: z
    .array(z.string())
    .optional()
    .describe("The clinical criteria that must be satisfied for authorization."),
  decision_days: z
    .number()
    .optional()
    .describe("Target turnaround time for the determination, in days."),
};

export interface CheckAuthRequirementsOutput {
  found: boolean;
  matched?: boolean;
  procedure_code: string;
  payer_id: string;
  payer_name?: string;
  diagnosis_group?: string;
  plan_type?: string;
  auth_required?: boolean;
  criteria_list?: string[];
  decision_days?: number;
}

export const checkAuthRequirementsTool = {
  name: "check_auth_requirements",
  config: {
    title: "Check authorization requirements",
    description:
      "Determine whether a payer requires prior authorization for a given procedure, diagnosis group, and plan type, and return the clinical criteria that must be met. Matching is tiered: an exact diagnosis_group + plan_type rule is preferred, with graceful fallback to a procedure-level rule (see the 'matched' flag). Requires no API key.",
    inputSchema: inputShape,
    outputSchema: outputShape,
  },
  run(input: CheckAuthRequirementsInput): CheckAuthRequirementsOutput {
    const result: AuthRequirementResult | null = checkAuthRequirements(input);
    if (!result) {
      return {
        found: false,
        procedure_code: input.procedure_code,
        payer_id: input.payer_id,
      };
    }
    return {
      found: true,
      matched: result.matched,
      procedure_code: result.procedure_code,
      payer_id: result.payer_id,
      payer_name: result.payer_name,
      diagnosis_group: result.diagnosis_group,
      plan_type: result.plan_type,
      auth_required: result.auth_required,
      criteria_list: result.criteria_list,
      decision_days: result.decision_days,
    };
  },
} satisfies ToolDefinition<CheckAuthRequirementsInput, CheckAuthRequirementsOutput>;
