/**
 * Domain types for the clinical-rules knowledge layer.
 *
 * These interfaces are the typed return contracts exported for consuming
 * pipelines (e.g. the Track 2 LangGraph nodes). A caller never has to parse
 * free text out of a tool response — every tool returns one of these shapes
 * as `structuredContent`.
 */

export type CoverageStatus =
  | "covered_no_auth"
  | "covered_with_prior_auth"
  | "not_covered"
  | "unknown";

export type GapSeverity = "blocking" | "advisory";

/** A single payer in the knowledge store. */
export interface Payer {
  payer_id: string;
  payer_name: string;
  plan_types: string[];
  cpt_domains: string[];
  /** True if this payer overrides (rather than layers on top of) the CMS baseline. */
  cms_baseline_override: boolean;
}

/** Federal NCD document summary (public domain). */
export interface NcdDocument {
  ncd_id: string;
  title: string;
  effective_date: string;
  summary: string;
  full_text_url: string;
}

/** Local (MAC) LCD document summary (public domain). */
export interface LcdDocument {
  lcd_id: string;
  contractor_name: string;
  title: string;
  effective_date: string;
  summary: string;
  states_covered: string[];
}

/** Free-form payer overlay criteria attached to a coverage policy. */
export interface CoverageCriteria {
  summary: string;
  imaging_required?: boolean;
  conservative_therapy_weeks_required?: number;
  overlay_notes?: string;
  [key: string]: unknown;
}

/**
 * The assembled coverage picture for one CPT/payer pair: the payer overlay
 * joined to the federal NCD/LCD documents it sits on top of.
 */
export interface CoveragePolicyResult {
  cpt_code: string;
  payer_id: string;
  payer_name: string;
  coverage_status: CoverageStatus;
  /** The payer-specific overlay criteria. */
  payer_overlay: CoverageCriteria;
  /** The federal baseline this overlay composes with (may be null if none on file). */
  federal_baseline: {
    ncd: NcdDocument | null;
    lcd: LcdDocument | null;
  };
  updated_at: string;
}

/** Result of an authorization-requirement lookup. */
export interface AuthRequirementResult {
  procedure_code: string;
  diagnosis_group: string;
  plan_type: string;
  payer_id: string;
  payer_name: string;
  auth_required: boolean;
  criteria_list: string[];
  /** Target turnaround time for the determination, in days. */
  decision_days: number;
  matched: boolean;
}

/** One documentation gap identified by flag_documentation_gaps. */
export interface DocumentationGap {
  element: string;
  severity: GapSeverity;
  /** Suggested chart language the submitter could add to close the gap. */
  suggested_language: string;
}

/** Structured output contract for flag_documentation_gaps. */
export interface DocumentationGapResult {
  payer_id: string;
  procedure_code: string;
  /** 0-100 documentation completeness score. */
  completeness_score: number;
  gaps: DocumentationGap[];
  has_blocking_gaps: boolean;
  /** Where the gap assessment came from: the live model or the mock fixture. */
  analysis_source: "claude" | "mock";
  summary: string;
}
