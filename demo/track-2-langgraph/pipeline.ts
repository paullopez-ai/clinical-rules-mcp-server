/**
 * Track 2 — four-node LangGraph StateGraph that composes two knowledge layers
 * to produce a prior-authorization determination (Skill 3, Skill 5).
 *
 *   AuthRequestNode → CoverageCheckNode → DocumentationAuditNode → DeterminationNode
 *                            │                      │
 *               [CMS Connector stub +        [flag_documentation_gaps]
 *                get_coverage_policy,
 *                merged via Promise.all]
 *
 * DeterminationNode routes to HumanReviewNode (interrupt-before) when confidence
 * < 0.8. Run with MOCK_LLM=true to require no API key:
 *
 *   MOCK_LLM=true npx tsx demo/track-2-langgraph/pipeline.ts
 */
import { Annotation, StateGraph, START, END, interrupt, Command, MemorySaver } from "@langchain/langgraph";
import { cmsConnectorLookup, type CmsBaseline } from "./cms-connector-stub.js";
import { getCoveragePolicyResilient } from "./mcp-client.js";
import { checkAuthRequirementsTool } from "../../src/tools/index.js";
import { flagDocumentationGapsTool } from "../../src/tools/index.js";
import type { GetCoveragePolicyOutput } from "../../src/tools/get-coverage-policy.js";
import type { CheckAuthRequirementsOutput } from "../../src/tools/check-auth-requirements.js";
import type { DocumentationGapResult } from "../../src/types/coverage.js";
import type {
  AuthRequest,
  Determination,
} from "../../src/shared/types/pipeline.js";

/** Confidence below this routes to HumanReviewNode (PRD 2.2). */
export const HUMAN_REVIEW_THRESHOLD = 0.8;

// ── Typed graph state ──────────────────────────────────────────────────────
const AuthState = Annotation.Root({
  request: Annotation<AuthRequest>(),
  federalBaseline: Annotation<CmsBaseline | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  payerOverlay: Annotation<GetCoveragePolicyOutput | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  coverageVia: Annotation<string>({ reducer: (_p, n) => n, default: () => "" }),
  authRequirements: Annotation<CheckAuthRequirementsOutput | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  gapReport: Annotation<DocumentationGapResult | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  determination: Annotation<Determination | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  humanDecision: Annotation<string | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  log: Annotation<string[]>({
    reducer: (p, n) => [...p, ...n],
    default: () => [],
  }),
});

type State = typeof AuthState.State;

// ── Nodes ──────────────────────────────────────────────────────────────────

function authRequestNode(state: State): Partial<State> {
  const r = state.request;
  return {
    log: [
      `AuthRequestNode: ${r.cpt_code} / ${r.icd10} / ${r.plan_type} / ${r.payer_id}`,
    ],
  };
}

/**
 * CoverageCheckNode — runs the two knowledge queries in parallel and merges
 * them. Neither the federal baseline nor the payer overlay is sufficient alone.
 */
async function coverageCheckNode(state: State): Promise<Partial<State>> {
  const r = state.request;
  const [federal, overlay] = await Promise.all([
    cmsConnectorLookup(r.cpt_code),
    getCoveragePolicyResilient({ cpt_code: r.cpt_code, payer_id: r.payer_id }),
  ]);

  const auth = checkAuthRequirementsTool.run({
    procedure_code: r.cpt_code,
    diagnosis_group: r.diagnosis_group,
    plan_type: r.plan_type,
    payer_id: r.payer_id,
  });

  return {
    federalBaseline: federal,
    payerOverlay: overlay.result,
    coverageVia: overlay.via,
    authRequirements: auth,
    log: [
      `CoverageCheckNode: federal baseline ${federal.ncds.length} NCD / ${federal.lcds.length} LCD; ` +
        `payer overlay via ${overlay.via} (status=${overlay.result.coverage_status}); ` +
        `auth_required=${auth.auth_required}`,
    ],
  };
}

/** DocumentationAuditNode — gap analysis against the request criteria slice. */
async function documentationAuditNode(state: State): Promise<Partial<State>> {
  const r = state.request;
  const gapReport = await flagDocumentationGapsTool.run({
    clinical_notes: r.clinical_notes,
    procedure_code: r.cpt_code,
    payer_id: r.payer_id,
  });
  return {
    gapReport,
    log: [
      `DocumentationAuditNode: completeness=${gapReport.completeness_score} ` +
        `blocking=${gapReport.has_blocking_gaps} (source=${gapReport.analysis_source})`,
    ],
  };
}

/**
 * Confidence rubric (documented, deterministic):
 *   confidence = 0.20 + 0.75 * (completeness/100)
 *              − 0.20 if coverage policy not found
 *              − 0.05 if no exact auth-rule match
 * Rounded to two decimals, clamped to [0,1].
 */
function computeConfidence(
  gap: DocumentationGapResult,
  overlay: GetCoveragePolicyOutput,
  auth: CheckAuthRequirementsOutput,
): number {
  let c = 0.2 + 0.75 * (gap.completeness_score / 100);
  if (!overlay.found) c -= 0.2;
  if (auth.found && auth.matched === false) c -= 0.05;
  c = Math.max(0, Math.min(1, c));
  return Math.round(c * 100) / 100;
}

function determinationNode(state: State): Partial<State> {
  const gap = state.gapReport!;
  const overlay = state.payerOverlay!;
  const auth = state.authRequirements!;
  const confidence = computeConfidence(gap, overlay, auth);

  const attribution = {
    federal_baseline: [
      ...(state.federalBaseline?.ncds.map((n) => `${n.ncd_id}: ${n.title}`) ?? []),
      ...(state.federalBaseline?.lcds.map((l) => `${l.lcd_id}: ${l.title}`) ?? []),
    ],
    payer_overlay: [
      `${overlay.payer_id} status=${overlay.coverage_status}`,
      ...(auth.criteria_list ?? []),
    ],
    documentation_gaps: gap.gaps.map((g) => `[${g.severity}] ${g.element}`),
  };

  const needsReview = confidence < HUMAN_REVIEW_THRESHOLD;
  const status = needsReview ? "pending_human_review" : "approved";

  const determination: Determination = {
    status,
    confidence,
    rationale: needsReview
      ? `Confidence ${confidence} is below the ${HUMAN_REVIEW_THRESHOLD} threshold` +
        (gap.has_blocking_gaps ? " (blocking documentation gaps present)." : ".")
      : `Confidence ${confidence} meets the ${HUMAN_REVIEW_THRESHOLD} threshold; criteria satisfied.`,
    attribution,
    timestamp: new Date().toISOString(),
  };

  return {
    determination,
    log: [`DeterminationNode: confidence=${confidence} → ${status}`],
  };
}

/**
 * HumanReviewNode — interrupt-before trust boundary (Skill 5). The graph pauses
 * here and surfaces the determination; it resumes only when a human supplies a
 * decision via Command({ resume }).
 */
function humanReviewNode(state: State): Partial<State> {
  const decision = interrupt({
    reason: "confidence_below_threshold",
    determination: state.determination,
    gaps: state.gapReport?.gaps ?? [],
  }) as string;

  const det = state.determination!;
  const resolved: Determination = {
    ...det,
    status: decision === "approve" ? "approved" : "denied",
    rationale: `${det.rationale} Human reviewer decision: ${decision}.`,
  };
  return {
    humanDecision: decision,
    determination: resolved,
    log: [`HumanReviewNode: human decision = ${decision}`],
  };
}

// ── Graph wiring ────────────────────────────────────────────────────────────
function routeAfterDetermination(state: State): "humanReview" | typeof END {
  return state.determination!.confidence < HUMAN_REVIEW_THRESHOLD
    ? "humanReview"
    : END;
}

export function buildPipeline() {
  const graph = new StateGraph(AuthState)
    .addNode("authRequest", authRequestNode)
    .addNode("coverageCheck", coverageCheckNode)
    .addNode("documentationAudit", documentationAuditNode)
    .addNode("determine", determinationNode)
    .addNode("humanReview", humanReviewNode)
    .addEdge(START, "authRequest")
    .addEdge("authRequest", "coverageCheck")
    .addEdge("coverageCheck", "documentationAudit")
    .addEdge("documentationAudit", "determine")
    .addConditionalEdges("determine", routeAfterDetermination, {
      humanReview: "humanReview",
      [END]: END,
    })
    .addEdge("humanReview", END);

  return graph.compile({ checkpointer: new MemorySaver() });
}

export interface ScenarioResult {
  determination: Determination;
  interrupted: boolean;
  log: string[];
}

/**
 * Run one request end-to-end. If HumanReviewNode fires, resume with the
 * supplied reviewer decision (default "approve") so the demo completes in one
 * call. The `interrupted` flag records whether the trust boundary triggered.
 */
export async function runScenario(
  request: AuthRequest,
  reviewerDecision = "approve",
): Promise<ScenarioResult> {
  const app = buildPipeline();
  const config = { configurable: { thread_id: `${request.cpt_code}-${Date.now()}` } };

  let result = (await app.invoke({ request }, config)) as State & {
    __interrupt__?: unknown[];
  };
  let interrupted = false;

  if (result.__interrupt__ && result.__interrupt__.length > 0) {
    interrupted = true;
    result = (await app.invoke(
      new Command({ resume: reviewerDecision }),
      config,
    )) as State & { __interrupt__?: unknown[] };
  }

  return {
    determination: result.determination!,
    interrupted,
    log: result.log,
  };
}

// ── Demo scenarios (PRD Section 3.3) ────────────────────────────────────────
export const SCENARIO_2_DENIAL: AuthRequest = {
  cpt_code: "27447",
  icd10: "M17.11",
  diagnosis_group: "knee_osteoarthritis",
  plan_type: "MA-PPO",
  payer_id: "PAYER_MEDICARE_ADV_B",
  clinical_notes:
    "62F with right knee pain. Weight-bearing X-ray shows severe medial joint-space narrowing (KL grade 4). Requesting total knee arthroplasty. No supervised conservative therapy or physical therapy course documented.",
};

export const SCENARIO_3_CLEAN: AuthRequest = {
  cpt_code: "99213",
  icd10: "J06.9",
  diagnosis_group: "acute_uri",
  plan_type: "PPO",
  payer_id: "PAYER_COMMERCIAL_A",
  clinical_notes:
    "Established patient, acute upper respiratory infection. Relevant history, focused exam, and low-complexity medical decision-making documented. Symptomatic management advised.",
};

async function main(): Promise<void> {
  for (const [label, request, decision] of [
    ["Scenario 2 — denial path (HumanReviewNode expected)", SCENARIO_2_DENIAL, "deny"],
    ["Scenario 3 — clean approval (no HumanReviewNode)", SCENARIO_3_CLEAN, "approve"],
  ] as const) {
    console.log(`\n${"=".repeat(72)}\n${label}\n${"=".repeat(72)}`);
    const res = await runScenario(request, decision);
    for (const line of res.log) console.log("  " + line);
    console.log(`  HumanReviewNode fired: ${res.interrupted}`);
    console.log("  ── Determination ──");
    console.log(JSON.stringify(res.determination, null, 2).split("\n").map((l) => "  " + l).join("\n"));
  }
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
