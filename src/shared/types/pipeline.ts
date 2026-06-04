/**
 * Typed state contract for the Track 2 LangGraph pipeline.
 *
 * Each node is a pure function `(state: AuthState) => Partial<AuthState>`. The
 * node boundaries map to distinct knowledge sources / decision types, not an
 * arbitrary split (Skill 3):
 *
 *   AuthRequestNode      → normalize and validate the request
 *   CoverageCheckNode    → federal baseline (CMS Connector) + payer overlay
 *                          (this server), merged
 *   DocumentationAuditNode → flag_documentation_gaps against the request slice
 *   DeterminationNode    → confidence + routing to HumanReviewNode (< 0.8)
 */
import type { CmsBaseline } from "../../../demo/track-2-langgraph/cms-connector-stub.js";
import type { GetCoveragePolicyOutput } from "../../tools/get-coverage-policy.js";
import type { CheckAuthRequirementsOutput } from "../../tools/check-auth-requirements.js";
import type { DocumentationGapResult } from "../../types/coverage.js";

export interface AuthRequest {
  cpt_code: string;
  icd10: string;
  diagnosis_group: string;
  plan_type: string;
  payer_id: string;
  clinical_notes: string;
}

export type DeterminationStatus =
  | "approved"
  | "pending_human_review"
  | "denied"
  | "needs_more_documentation";

export interface Determination {
  status: DeterminationStatus;
  confidence: number;
  rationale: string;
  /** Attribution: which layer each finding came from (Skill 5 audit trail). */
  attribution: {
    federal_baseline: string[];
    payer_overlay: string[];
    documentation_gaps: string[];
  };
  timestamp: string;
}
