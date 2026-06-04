import { z } from "zod";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { ToolDefinition } from "../types/mcp.js";
import type {
  DocumentationGap,
  DocumentationGapResult,
  GapSeverity,
} from "../types/coverage.js";
import { getDocumentationCriteria } from "../db/queries/documentation.js";
import { completeJson } from "../llm.js";

/**
 * flag_documentation_gaps — combine structured criteria retrieval with
 * LLM gap detection (Skill 1, Skill 3, Skill 6).
 *
 * The tool retrieves ONLY the documentation criteria for this procedure/payer
 * (Skill 6: token budget capped at the request slice, never the full store),
 * then asks Claude to compare the submitted clinical notes against that slice.
 *
 * The system prompt below is written as a literal specification: it fixes the
 * output schema, makes severity an enum (blocking vs. advisory) rather than a
 * judgment call, and defines a 0-100 completeness rubric — so the result is
 * deterministically parseable by a calling pipeline (Skill 1).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface FlagDocumentationGapsInput {
  clinical_notes: string;
  procedure_code: string;
  payer_id: string;
}

const inputShape = {
  clinical_notes: z
    .string()
    .min(1)
    .describe(
      "The free-text clinical documentation submitted with the authorization request. No PHI should be used in this demo; synthetic notes only.",
    ),
  procedure_code: z
    .string()
    .regex(/^[0-9]{4}[0-9A-Z]$/)
    .describe("The 5-character CPT/HCPCS procedure code. Example: '27447'."),
  payer_id: z
    .string()
    .min(1)
    .describe("The payer identifier whose documentation criteria to evaluate against."),
};

const gapSchema = z.object({
  element: z.string().describe("The required documentation element that is missing or weak."),
  severity: z
    .enum(["blocking", "advisory"])
    .describe(
      "blocking = the element is a payer blocking_element and its absence would stop authorization; advisory = recommended but non-blocking.",
    ),
  suggested_language: z
    .string()
    .describe("Concrete chart language the submitter could add to close the gap."),
});

const outputShape = {
  payer_id: z.string(),
  procedure_code: z.string(),
  completeness_score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("0-100 documentation completeness score per the rubric."),
  gaps: z.array(gapSchema).describe("Identified documentation gaps."),
  has_blocking_gaps: z
    .boolean()
    .describe("True if any gap has severity 'blocking'. Drives pipeline escalation."),
  analysis_source: z
    .enum(["claude", "mock"])
    .describe("Whether the assessment came from the live model or the deterministic fixture."),
  summary: z.string(),
};

/**
 * The output contract and scoring rubric, stated once and shared by both the
 * live Claude path (as the system prompt) and the human reader.
 */
const SPEC = `You are a prior-authorization documentation auditor. You compare a set of
submitted clinical notes against a payer's required documentation elements and
report what is missing.

OUTPUT CONTRACT — return ONLY a JSON object, no prose, with exactly these keys:
{
  "completeness_score": integer 0-100,
  "summary": string (<= 2 sentences),
  "gaps": [
    {
      "element": string,        // the required element that is missing or weak
      "severity": "blocking" | "advisory",
      "suggested_language": string  // concrete chart language to close the gap
    }
  ]
}

SEVERITY CLASSIFICATION RULES (not a judgment call):
- severity = "blocking" if and only if the missing element appears in the
  payer's BLOCKING_ELEMENTS list. Its absence halts authorization.
- severity = "advisory" for any required element that is missing but is NOT in
  BLOCKING_ELEMENTS. It is recommended but does not halt authorization.

COMPLETENESS SCORING RUBRIC (0-100):
- Start at 100.
- Subtract 25 for each missing BLOCKING element.
- Subtract 8 for each missing ADVISORY element.
- Floor the result at 0; round to an integer.

Only consider the REQUIRED_ELEMENTS provided. Do not invent elements. If an
element is clearly evidenced in the notes, it is NOT a gap.`;

function loadMockFixture(): Record<
  string,
  { completeness_score: number; summary: string; gaps: DocumentationGap[] }
> {
  const path = resolve(__dirname, "../../data/mock-gap-analysis.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    by_procedure: Record<
      string,
      { completeness_score: number; summary: string; gaps: DocumentationGap[] }
    >;
  };
  return parsed.by_procedure;
}

function buildResult(
  input: FlagDocumentationGapsInput,
  partial: { completeness_score: number; summary: string; gaps: DocumentationGap[] },
  source: "claude" | "mock",
): DocumentationGapResult {
  const gaps = partial.gaps;
  return {
    payer_id: input.payer_id,
    procedure_code: input.procedure_code,
    completeness_score: Math.max(0, Math.min(100, Math.round(partial.completeness_score))),
    gaps,
    has_blocking_gaps: gaps.some((g) => g.severity === "blocking"),
    analysis_source: source,
    summary: partial.summary,
  };
}

export const flagDocumentationGapsTool = {
  name: "flag_documentation_gaps",
  config: {
    title: "Flag documentation gaps",
    description:
      "Compare submitted clinical notes against a payer's required documentation elements for a procedure and return a structured gap report: a 0-100 completeness score, a list of gaps each classified as 'blocking' or 'advisory', and suggested chart language per gap. This is the only tool that calls a model. Set MOCK_LLM=true to return a deterministic fixture and require no API key.",
    inputSchema: inputShape,
    outputSchema: outputShape,
  },
  async run(input: FlagDocumentationGapsInput): Promise<DocumentationGapResult> {
    // Retrieve only the criteria slice for this procedure/payer (Skill 6).
    const criteria = getDocumentationCriteria(input.procedure_code, input.payer_id);

    // ── Mock mode: deterministic fixture, no network, no API key ──
    if (process.env.MOCK_LLM === "true") {
      const fixture = loadMockFixture();
      const entry = fixture[input.procedure_code] ?? fixture.default;
      if (!entry) {
        throw new Error("mock-gap-analysis.json is missing a 'default' entry.");
      }
      return buildResult(input, entry, "mock");
    }

    // ── Live mode: structured criteria + Claude gap detection ──
    if (!criteria) {
      return buildResult(
        input,
        {
          completeness_score: 0,
          summary: `No documentation criteria are on file for ${input.procedure_code} under ${input.payer_id}.`,
          gaps: [],
        },
        "claude",
      );
    }

    const userPrompt = JSON.stringify({
      PROCEDURE_CODE: input.procedure_code,
      PAYER_ID: input.payer_id,
      REQUIRED_ELEMENTS: criteria.required_elements,
      BLOCKING_ELEMENTS: criteria.blocking_elements,
      CLINICAL_NOTES: input.clinical_notes,
    });

    const raw = await completeJson({
      system: SPEC,
      user: userPrompt,
      model: process.env.GAP_ANALYSIS_MODEL ?? "claude-sonnet-4-6",
      maxTokens: 1024,
    });

    const parsed = parseModelJson(raw);
    return buildResult(input, parsed, "claude");
  },
} satisfies ToolDefinition<FlagDocumentationGapsInput, DocumentationGapResult>;

/** Extract the JSON object from a model completion, tolerating code fences. */
function parseModelJson(raw: string): {
  completeness_score: number;
  summary: string;
  gaps: DocumentationGap[];
} {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`Model did not return JSON: ${raw.slice(0, 200)}`);
  }
  const obj = JSON.parse(raw.slice(start, end + 1)) as {
    completeness_score?: number;
    summary?: string;
    gaps?: Array<{ element: string; severity: string; suggested_language: string }>;
  };
  return {
    completeness_score: obj.completeness_score ?? 0,
    summary: obj.summary ?? "",
    gaps: (obj.gaps ?? []).map((g) => ({
      element: g.element,
      severity: (g.severity === "blocking" ? "blocking" : "advisory") as GapSeverity,
      suggested_language: g.suggested_language,
    })),
  };
}
