# PRD: clinical-rules-mcp-server
<!-- prd:version=2.0 -->
<!-- prd:status=draft -->
<!-- prd:author=Paul Lopez -->
<!-- prd:created=2026-06-04 -->
<!-- prd:updated=2026-06-04 -->
<!-- prd:repo=paullopez-ai/clinical-rules-mcp-server -->
<!-- prd:ui-repo=~/MyNewSoftware/clinical-rules-ui -->
<!-- prd:demo-track=synthetic -->
<!-- prd:hyperscaler-track=none -->
<!-- prd:skills-primary=[1,3,6] -->
<!-- prd:skills-secondary=[5] -->

---

## SECTION 0: PRD METADATA

This prototype does not require a hyperscaler track. The MCP server is
intentionally infrastructure-agnostic: it runs over standard HTTP and is
designed to be deployable to any runtime. The demo value is the protocol
architecture and the knowledge layer design, not cloud infrastructure.
Track 1 (Claude Desktop) is the highest-impact demo and requires zero
infrastructure.

---

## SECTION 1: PURPOSE AND PORTFOLIO POSITIONING

### 1.1 One-Paragraph Description

`clinical-rules-mcp-server` is a purpose-built MCP server that exposes
payer-specific clinical authorization criteria as structured, agent-consumable
tools. It layers on top of Anthropic's native Claude for Healthcare CMS
Connector, adding the custom payer overlay logic that federal coverage data
alone cannot supply. The server transforms static clinical criteria documents
(sourced from CMS LCDs, NCDs, and synthetic payer rule sets) into a live,
queryable knowledge service. Any MCP-compatible agent runtime (Claude Desktop,
Claude Code, a LangGraph pipeline, or a custom agent) can call this server to
retrieve coverage requirements, check authorization prerequisites, and flag
documentation gaps at decision time.

### 1.2 Why This Prototype Exists

Most healthcare AI portfolio projects demonstrate API consumption. This one
demonstrates API authorship. Enterprise clients and interviewers increasingly
distinguish between engineers who call AI services and architects who design
AI-readable knowledge infrastructure. This prototype lands clearly in the
second category.

It also closes a real architectural gap. Anthropic's CMS Connector provides
Medicare national and local coverage determinations. Commercial payers add
their own criteria on top of those federal baselines. A prior authorization
decision requires both layers. This server supplies the overlay layer that
Anthropic's native connector was not designed to cover.

### 1.3 Portfolio Narrative

This prototype is the first in the post-Optum collection to be authored as an
MCP server rather than a consuming application. It completes a pattern the
earlier repos set up: `prior-auth-radar` and `payer-auth-intelligence`
demonstrate how agents consume healthcare data; this one demonstrates how
healthcare knowledge is structured for agent consumption. `auth-agent-network`
then calls this server as an optional dependency, making it the knowledge layer
for the broader prior authorization agent network.

The Manifest connection is deliberate. The Skygile Manifest concept (canonical,
portable, agent-readable skill registries) is a direct architectural ancestor
of what this server does for clinical criteria: one declarative source,
deployable to any agent surface, governance-controlled.

This prototype will be catalogued in a new collection index for post-Optum
prototypes to be created separately. It is not added to `provider-api-ai-poc-index`.

### 1.4 Demonstrated Skills (Primary)

| Skill | How Demonstrated |
|-------|-----------------|
| Skill 1: Specification Precision | Each MCP tool is defined with a strict JSON input schema, typed return contract, and explicit field-level descriptions; the tool spec is machine-readable and versioned in the PRD |
| Skill 3: Multi-Agent Orchestration | Track 2 LangGraph pipeline demonstrates MCP server consumption inside a four-node agentic pipeline; the CoverageCheckNode calls both the Anthropic connector and this server, then the DeterminationNode synthesizes both layers |
| Skill 6: Context Architecture | The server is the context layer: CMS public-domain knowledge is transformed from document text into structured, semantically queryable tool responses; flag_documentation_gaps uses LLM-assisted gap analysis against retrieved structured criteria |

### 1.5 Demonstrated Skills (Secondary)

Skill 5 (Trust and Security Design): HumanReviewNode interrupt-before pattern
in Track 2 and Track 3 for determinations below a confidence threshold; audit
trail of determination inputs and confidence scores.

---

## SECTION 2: ARCHITECTURE

### 2.1 System Context Diagram (ASCII)

```
Claude Agent (Claude Desktop / LangGraph / custom runtime)
    |
    ├── CMS Coverage Connector (Anthropic native, Claude for Healthcare)
    │       └── NCD/LCD ground truth from cms.gov
    │
    ├── ICD-10 Connector (Anthropic native, Claude for Healthcare)
    │       └── Diagnosis code validation from CMS/CDC
    │
    └── clinical-rules-mcp-server  [this repo]  (port 3001)
            ├── get_coverage_policy(cpt_code, payer_id)         [Skill 1, Skill 6]
            ├── check_auth_requirements(procedure, dx, plan)    [Skill 1, Skill 6]
            ├── flag_documentation_gaps(notes, criteria_result) [Skill 1, Skill 3]
            └── list_payers()
                    |
                    ├── SQLite knowledge store (dev)
                    │       ├── CMS NCD/LCD data (public domain)
                    │       ├── Synthetic payer profiles
                    │       └── CPT / ICD-10 mapping tables
                    │
                    └── Internal Claude API call (flag_documentation_gaps only)

Track 2: LangGraph Pipeline
    AuthRequestNode → CoverageCheckNode → DocumentationAuditNode → DeterminationNode
                             |                       |
                    [MCP: get_coverage_policy] [MCP: flag_documentation_gaps]
                    [Anthropic CMS Connector]

Track 3: Review UI (clinical-rules-ui, bootstrapped)
    app/page.tsx         → Auth request submission form
    app/review/[id]      → HumanReviewNode panel
    app/history          → Request history list
    app/api/auth-request → LangGraph pipeline trigger
```

**Mermaid Output Requirement:**
Claude Code must generate `docs/architecture.mermaid` as a build artifact
during Phase 1. This file is consumed by nano-banana to produce the rendered
diagram for the README. Use `graph TD` layout.

### 2.2 Core Implementation

**MCP Server**
- Runtime: Node.js / TypeScript
- SDK: `@modelcontextprotocol/sdk`
- HTTP: Express (peer dependency)
- Knowledge store: SQLite via `better-sqlite3` (dev); Postgres-compatible
  schema documented for production reference
- Four tools: `list_payers`, `get_coverage_policy`, `check_auth_requirements`,
  `flag_documentation_gaps`

**Track 2 LangGraph Pipeline**
- Framework: LangGraph.js (TypeScript, in-process StateGraph)
- Four nodes: `AuthRequestNode`, `CoverageCheckNode`, `DocumentationAuditNode`,
  `DeterminationNode`
- `CoverageCheckNode` calls both the Anthropic CMS Connector and
  `get_coverage_policy` from this server; neither source is sufficient alone
- `DeterminationNode` routes to `HumanReviewNode` (interrupt-before) for
  confidence < 0.8

**Track 3 UI**
- Next.js 16+ (App Router), bootstrapped from Paul's `/bootstrap` command
- Three screens: submission form, human review panel, request history

### 2.3 Data Architecture

| Source | Content | Provenance |
|--------|---------|-----------|
| CMS Coverage Database | NCDs and LCD summaries | Public domain, coverage.cms.gov |
| CMS Prior Auth Lists | Medicare Advantage procedures requiring auth | Public domain, cms.gov |
| CMS ICD-10-CM Files | Diagnosis code definitions | Public domain, cms.gov |
| AMA CPT Descriptors | Procedure code descriptions (public subset) | Public domain |
| Synthetic Payer Profiles | Illustrative commercial overlay criteria | Authored for demo; clearly labeled |

**No proprietary or PHI data is used anywhere in this prototype.**

Database schema (SQLite / Postgres-compatible):
```sql
coverage_policies      (cpt_code, payer_id, coverage_status, ncd_id, lcd_id, criteria_json, updated_at)
auth_requirements      (procedure_code, diagnosis_group, plan_type, payer_id, auth_required, criteria_list_json, decision_days)
ncd_documents          (ncd_id, title, effective_date, summary, full_text_url)
lcd_documents          (lcd_id, contractor_name, title, effective_date, summary, states_covered)
payer_profiles         (payer_id, payer_name, plan_types, cpt_domains, cms_baseline_override)
documentation_criteria (criteria_id, payer_id, procedure_code, required_elements_json, blocking_elements_json)
```

### 2.4 Key Design Decisions

**Decision 1: MCP over REST**
Rationale: Publishing clinical criteria as MCP tools rather than a REST API
means any MCP-compatible agent runtime can consume this knowledge service
without custom integration code. Trade-off: MCP tooling is younger than REST;
Claude Desktop is the primary client and is well-supported.

**Decision 2: Compose with Anthropic CMS Connector, do not duplicate it**
Rationale: The CMS Connector already handles NCD/LCD document retrieval.
This server handles payer-specific overlay logic on top of that baseline.
Neither replaces the other; the agent calls both. Trade-off: requires
Claude Desktop or a pipeline that has both connectors active simultaneously.

**Decision 3: LLM-assisted gap analysis inside flag_documentation_gaps**
Rationale: Pure string matching on clinical notes is too brittle; a
standalone LLM call without structured criteria is too generic. The tool
combines structured criteria retrieval with LLM gap detection.
Trade-off: this tool requires an Anthropic API key even in Track 1 if
invoked; Track 1 demo should call list_payers and get_coverage_policy
to avoid the API key requirement.

**Decision 4: SQLite for dev, Postgres schema for production reference**
Rationale: Keeps Track 1 zero-infrastructure. The schema is documented
as Postgres-compatible so the server can be upgraded to a production
persistence layer without schema migration.

---

## SECTION 3: DEMO TRACK (SYNTHETIC DATA)

### 3.1 Mock Data Strategy

Three synthetic payer profiles (`PAYER_COMMERCIAL_A`, `PAYER_MEDICARE_ADV_B`,
`PAYER_MEDICAID_C`) are authored in `data/synthetic-payers.json` and seeded
via `scripts/seed-synthetic-payers.ts`. CMS NCD/LCD data is cached in
`data/cms-ncds.json` and `data/cms-lcds.json`, pulled once from CMS public
sources by `scripts/seed-cms-data.ts` and committed to the repo so Track 1
requires no live CMS API call.

### 3.2 Mock LLM Mode

`flag_documentation_gaps` is the only tool that calls Claude internally.
For Track 1 demos that do not need gap analysis, this tool can be skipped.
Set `MOCK_LLM=true` to return a deterministic fixture response from
`data/mock-gap-analysis.json` instead of calling Claude.
All tests must use `MOCK_LLM=true`; never call a real LLM in the test suite.

### 3.3 Demo Scenarios

**Scenario 1: Coverage Policy Lookup (Track 1, Claude Desktop)**
Input: CPT 27447 (total knee replacement), `PAYER_COMMERCIAL_A`
Expected path: Claude Desktop calls `get_coverage_policy` → returns coverage
status, applicable LCD, payer criteria overlay → Claude explains the result
in natural language.
Demonstrates: Skill 1 (structured tool contract), Skill 6 (knowledge retrieval)
Interview value: Shows MCP server authorship in the simplest possible way.
Running in Claude Desktop with no infrastructure is visually unambiguous.

**Scenario 2: Full Authorization Assessment (Track 2, LangGraph)**
Input: CPT 27447, ICD-10 M17.11, `PAYER_MEDICARE_ADV_B`, clinical notes
with missing conservative treatment history.
Expected path: `CoverageCheckNode` calls both Anthropic CMS Connector and
`get_coverage_policy` → `DocumentationAuditNode` calls `flag_documentation_gaps`
→ `DeterminationNode` confidence 0.62 → `HumanReviewNode` fires → structured
gap report returned.
Demonstrates: Skill 3 (multi-node pipeline composing two knowledge layers),
Skill 5 (HumanReviewNode trust boundary)
Interview value: This is the primary interview scenario. It shows the two-layer
architecture (federal baseline + payer overlay) and the human-in-the-loop
pattern in a single run.

**Scenario 3: Clean Approval (Track 2, contrast scenario)**
Input: CPT 99213 (office visit), ICD-10 J06.9, `PAYER_COMMERCIAL_A`,
complete clinical notes.
Expected path: All criteria met → `DeterminationNode` confidence 0.91 →
no HumanReviewNode → approved.
Demonstrates: Happy path; useful for showing the confidence routing logic
by contrast with Scenario 2.

### 3.4 Demo Track Run Instructions

```bash
# Clone and install
git clone https://github.com/paullopez-ai/clinical-rules-mcp-server
cd clinical-rules-mcp-server
bun install

# Seed knowledge base (one-time; CMS data already cached in data/)
bun run scripts/seed-cms-data.ts
bun run scripts/seed-synthetic-payers.ts

# Start MCP server (Track 1)
bun run src/server.ts
# Server running at http://localhost:3001
# Add to Claude Desktop claude_desktop_config.json, then ask:
# "Does PAYER_COMMERCIAL_A require prior auth for CPT 27447 for ICD-10 M17.11?"

# Run Track 2 LangGraph pipeline (requires ANTHROPIC_API_KEY or MOCK_LLM=true)
MOCK_LLM=true bun run demo/track-2-langgraph/pipeline.ts
# Expected: structured determination printed to terminal in ~10 seconds
```

---

## SECTION 4: HYPERSCALER TRACK

Not applicable. The MCP server's core value is protocol architecture and
knowledge layer design, both of which are intentionally infrastructure-agnostic.
The Track 2 LangGraph pipeline runs on Node.js with only an Anthropic API key.
No cloud account is required for any track.

AWS Bedrock routing is available as an option for Track 2 by setting
`USE_BEDROCK=true`. This does not constitute a hyperscaler track because no
infrastructure is provisioned; it only changes the model endpoint.

---

## SECTION 5: SKILL BUILD INTENT

<!-- PERSONAL USE ONLY — this section does not appear in the README,
     in any public output, or in any file committed to the repo.
     It is authoring guidance and personal interview prep material only. -->

### Skill 1: Specification Precision and Clarity of Intent
**Strength Target:** Strong

**Evidence to Build:**
- `src/tools/get-coverage-policy.ts`: tool definition with strict Zod input
  schema, typed return interface, field-level descriptions including worked
  examples for edge cases; structured output binding so the MCP client
  receives a parseable contract, not raw text
- `src/tools/flag-documentation-gaps.ts`: system prompt written as a literal
  specification with explicit output schema (gap list, severity enum, suggested
  language per gap, completeness score 0-100); escalation criteria defined
  (blocking vs. advisory severity classification rules)
- `[repo-name].prd.md` itself: versioned PRD with HTML comment metadata
  markers; serves as the machine-readable spec that anchors the build

**README Narrative:**
Every tool in this server is defined as a typed contract, not a natural
language description. The input schemas use Zod with explicit field-level
descriptions and required/optional markers. The internal prompt for
`flag_documentation_gaps` specifies output fields, severity classification
rules, and a 0-100 completeness scoring rubric before a single example
is generated. The goal was to make the tool boundary between the MCP server
and any calling agent as explicit as a function signature: the caller knows
exactly what to send, and the server knows exactly what to return.

**Interview Talking Point:**
Situation: Most MCP servers in the wild expose tools with vague natural
language descriptions, which forces the calling agent to guess at input
format and interpret output structure.
Task: Design tool contracts specific enough that any MCP-compatible agent
could call them correctly without reading documentation.
Action: I wrote each tool definition with a strict Zod schema, typed return
interfaces exported for use by consuming pipelines, and field-level
descriptions with classification rules rather than open-ended descriptions.
The gap analysis tool's system prompt specifies severity as an enum, not
a judgment call, so the output is deterministically parseable.
Result: The LangGraph pipeline's CoverageCheckNode consumes the tool output
without any parsing or normalization layer. [needs metric from Paul: error rate
on tool calls before vs. after strict schemas]

---

### Skill 3: Task Decomposition and Multi-Agent Orchestration
**Strength Target:** Strong

**Evidence to Build:**
- `demo/track-2-langgraph/pipeline.ts`: four-node StateGraph with typed state;
  `CoverageCheckNode` runs two parallel knowledge queries (Anthropic CMS
  Connector + this server's `get_coverage_policy`) via `Promise.all` and
  merges results; `DeterminationNode` uses conditional edges to route to
  `HumanReviewNode` or directly to output
- Each node is a pure function: `(state: AuthState) => Partial<AuthState>`;
  documented in `src/shared/types/pipeline.ts`
- `CriteriaLookupNode` fallback pattern: calls MCP server if running; falls
  back to `data/embedded-synthetic.ts` if not; pipeline never hard-fails

**README Narrative:**
The Track 2 pipeline is where the MCP server's architectural purpose becomes
visible. `CoverageCheckNode` runs two knowledge queries in parallel: the
Anthropic CMS Connector for federal NCD/LCD ground truth, and this server's
`get_coverage_policy` for the payer-specific overlay. Neither source alone
is sufficient for a real prior authorization determination. The node merges
both results before passing them downstream. The decomposition rationale is
documented inline: each node boundary represents a distinct knowledge source
or decision type, not an arbitrary split.

**Interview Talking Point:**
Situation: A prior authorization determination requires at minimum two
knowledge layers: what CMS covers nationally and what the specific payer
requires on top of that.
Task: Design an agentic pipeline where each layer is a separate, composable
knowledge source rather than a monolithic prompt.
Action: I built a four-node LangGraph pipeline where CoverageCheckNode
calls both the Anthropic CMS Connector and this MCP server in parallel,
then merges the results before the evaluation node sees them. The MCP server
is optional in this pipeline; if it is not running, the node falls back to
embedded synthetic criteria so the pipeline never hard-fails on a missing
dependency.
Result: The pipeline produces a structured determination with a clearly
attributed rationale: which criteria came from CMS, which from the payer
overlay, and which documentation gaps were identified by the LLM gap
analysis. [needs metric from Paul: pipeline run time, or comparison to
single-prompt approach]

---

### Skill 6: Context Architecture
**Strength Target:** Strong

**Evidence to Build:**
- `src/db/`: SQLite schema separating catalog-level knowledge (CMS documents,
  payer profiles) from request-level context (criteria for a specific
  procedure/diagnosis/plan combination); agents retrieve from the correct
  scope
- `src/tools/get-coverage-policy.ts`: `CriteriaLookupQuery` joins
  `coverage_policies`, `ncd_documents`, and `payer_profiles` to assemble
  the exact context slice needed for this request; no full-table scans
- `scripts/seed-cms-data.ts`: content-hash check on CMS data before
  re-seeding; only changed records are updated (incremental ingestion pattern)
- `flag_documentation_gaps`: retrieves only the criteria fields relevant to
  the procedure being evaluated before passing to Claude; token budget is
  capped at the criteria set for this request, not the full knowledge base

**README Narrative:**
The server is the context layer in the authorization agent stack. Rather
than hardcoding payer criteria in prompts, every criteria lookup is a
targeted query against a structured knowledge store. The schema separates
federal NCD/LCD documents from payer-specific overlay rules so the right
layer is queried at the right step. The gap analysis tool receives only
the criteria relevant to the specific procedure and payer, not the full
knowledge base, which keeps token usage proportional to the request.
The seed scripts use a content-hash check so CMS data updates re-index
only changed records rather than the full corpus.

**Interview Talking Point:**
Situation: Prior authorization criteria exist at two levels: federal CMS
policy and payer-specific overlays. Most AI demos hardcode one or both
levels into prompts, which makes the system brittle and expensive to update.
Task: Build a knowledge layer that separates these two sources, queries
them independently, and delivers only the relevant slice to the agent.
Action: I designed a normalized SQLite schema with separate tables for
CMS documents and payer profiles, wrote targeted queries that join the
relevant layers for a given CPT/diagnosis/plan combination, and capped
the context passed to the LLM at the criteria for this specific request.
The seed scripts check content hashes before re-indexing so updates are
incremental.
Result: The agent receives precisely scoped context for each request.
[needs metric from Paul: context size reduction vs. full-prompt approach,
or retrieval latency]

---

### Skill 5: Trust and Security Design (Secondary)
**Strength Target:** Moderate

**Evidence to Build:**
- `demo/track-2-langgraph/pipeline.ts`: `HumanReviewNode` interrupt-before
  pattern for DeterminationNode confidence < 0.8; human decision required
  before pipeline continues
- `src/tools/flag-documentation-gaps.ts`: severity enum (blocking / advisory)
  creates a structured trust boundary: blocking gaps halt the pipeline,
  advisory gaps are flagged but do not interrupt
- All determination outputs include confidence score, criteria attribution,
  and timestamp for audit trail

---

## SECTION 6: REPO STRUCTURE

### 6.1 MCP Server Repo

```
paullopez-ai/clinical-rules-mcp-server/
├── README.md                          # Public-facing; see Section 8
├── CLAUDE.md                          # Project bible; see Section 7.1   [Skill 1]
├── package.json
├── tsconfig.json
├── .env.example
├── docs/
│   ├── architecture.mermaid           # Build artifact; input for nano-banana
│   ├── data-sources.md                # Documents all public domain sources
│   └── interview-demo-guide.md        # 5-minute demo walkthrough
├── src/
│   ├── server.ts                      # MCP server entry point, tool registration
│   ├── tools/
│   │   ├── get-coverage-policy.ts     # [Skill 1, Skill 6]
│   │   ├── check-auth-requirements.ts # [Skill 1, Skill 6]
│   │   ├── flag-documentation-gaps.ts # [Skill 1, Skill 3]
│   │   └── list-payers.ts
│   ├── db/
│   │   ├── schema.ts                  # [Skill 6]
│   │   ├── client.ts
│   │   └── queries/
│   │       ├── coverage.ts            # [Skill 6]
│   │       ├── auth-requirements.ts
│   │       └── documentation.ts
│   └── types/
│       ├── coverage.ts
│       └── mcp.ts
├── scripts/
│   ├── seed-cms-data.ts               # Pulls from CMS public sources; hash-keyed
│   └── seed-synthetic-payers.ts
├── data/
│   ├── cms-ncds.json                  # Cached NCD data (public domain)
│   ├── cms-lcds.json                  # Cached LCD data (public domain)
│   ├── synthetic-payers.json          # Synthetic payer overlay data
│   └── mock-gap-analysis.json         # Deterministic fixture for MOCK_LLM=true
├── demo/
│   ├── track-1-claude-desktop/
│   │   └── README.md                  # Claude Desktop config + scenario prompts
│   ├── track-2-langgraph/
│   │   ├── pipeline.ts                # [Skill 3, Skill 5]
│   │   └── README.md
│   └── track-3-full-stack/
│       ├── pipeline.ts                # LangGraph pipeline with HumanReviewNode
│       └── cdk/                       # Optional CDK stack (not required for demo)
└── tests/
    ├── tools/
    │   ├── get-coverage-policy.test.ts
    │   ├── check-auth-requirements.test.ts
    │   ├── flag-documentation-gaps.test.ts
    │   └── list-payers.test.ts
    └── integration/
        └── scenario-2-full-pipeline.test.ts
```

### 6.2 UI Companion Repo

```
clinical-rules-ui/                     # ~/MyNewSoftware/clinical-rules-ui
├── app/
│   ├── page.tsx                       # Auth request submission form
│   ├── review/[requestId]/page.tsx    # HumanReviewNode panel
│   ├── history/page.tsx               # Request history list
│   ├── api/
│   │   └── auth-request/route.ts      # POST: triggers LangGraph pipeline
│   ├── layout.tsx                     # ThemeProvider wrapper [bootstrap - do not modify]
│   └── globals.css                    # OKLCH tokens [bootstrap - do not modify base]
├── components/
│   ├── theme-provider.tsx             # [bootstrap - do not modify]
│   ├── theme-toggle.tsx               # [bootstrap - do not modify]
│   ├── auth-request-form.tsx          # CPT, payer, diagnosis, plan type, notes
│   ├── determination-card.tsx         # Outcome summary with confidence score
│   ├── gap-list.tsx                   # Gap display with destructive/secondary badges
│   └── request-history-list.tsx       # Scrollable history with status badges
├── lib/
│   ├── utils.ts                       # cn() helper [bootstrap - do not modify]
│   └── pipeline-client.ts             # Fetch wrapper for auth-request route
└── CLAUDE.md                          # UI project bible; see Section 7.2
```

---

## SECTION 7: CLAUDE.md FILES

### 7.1 MCP Server Repo CLAUDE.md

```markdown
# CLAUDE.md — clinical-rules-mcp-server

## Project Identity
MCP server that exposes payer clinical authorization criteria as
agent-consumable tools. Designed to compose with Anthropic's native
Claude for Healthcare CMS Connector. The CMS Connector supplies the
federal NCD/LCD baseline; this server supplies the payer-specific
overlay. Neither is sufficient alone for a real authorization determination.

## Stack
- Runtime: Node.js / TypeScript (bun)
- MCP SDK: @modelcontextprotocol/sdk
- Database: SQLite via better-sqlite3 (dev); Postgres-compatible schema (prod ref)
- Track 2 pipeline: LangGraph.js (TypeScript, in-process StateGraph)
- LLM: Anthropic Claude via @anthropic-ai/sdk (direct API or Bedrock)
- Testing: Vitest

## Critical Constraints
- NO Optum, UHG, or proprietary payer data anywhere in this repo
- ALL external data must be public domain CMS sources or clearly labeled synthetic
- TypeScript strict mode throughout
- MOCK_LLM=true for all tests; never call real Claude in the test suite
- Every tool must have a corresponding unit test before marking complete

## Architecture Principles
The CMS Connector (Anthropic native) supplies the federal baseline.
This server supplies the payer-specific overlay.
The agent composes both. Neither replaces the other.
flag_documentation_gaps is the only tool that calls Claude internally;
all other tools are pure database queries.

## File Ownership
- src/server.ts: MCP server bootstrap and tool registration; Claude Code builds
- src/tools/: One file per tool, self-contained; Claude Code builds
- src/db/: Schema and query layer only, no business logic; Claude Code builds
- scripts/: Seed scripts; Claude Code builds
- data/: Seeded by seed scripts; do not hand-edit JSON files after seeding
- demo/: Standalone demo scripts; Claude Code builds
- docs/architecture.mermaid: Build artifact; Claude Code generates in Phase 1

## Environment Variables
ANTHROPIC_API_KEY=        # Required for Track 2+ and flag_documentation_gaps
MOCK_LLM=true             # Set false for Track 2+; true for all tests
MCP_PORT=3001             # Default MCP server port
USE_BEDROCK=false         # Set true to route Claude calls through AWS Bedrock

## Demo Track vs. Hyperscaler Track
Demo (MOCK_LLM=true): MCP server + Track 1 Claude Desktop; no API key needed
                      for list_payers, get_coverage_policy, check_auth_requirements
Track 2 (MOCK_LLM=false): Full LangGraph pipeline with live Claude reasoning;
                          requires ANTHROPIC_API_KEY
Hyperscaler: Not applicable for this prototype

## Mermaid Diagram Output
Generate docs/architecture.mermaid as a Phase 1 build artifact.
Use graph TD layout. This file is not optional.
nano-banana reads it to render the README diagram.

## Build Priority Order
1. MCP server + list_payers (validates server boots and tool responds)
2. Seed scripts + SQLite schema
3. get_coverage_policy + check_auth_requirements tools + unit tests
4. Track 1 Claude Desktop config and scenario prompts
5. flag_documentation_gaps tool + unit test
6. Track 2 LangGraph pipeline
7. README + docs/architecture.mermaid + interview-demo-guide.md
8. Track 3 UI (separate Claude Code session in clinical-rules-ui)

## Active Work
[ ] Phase 1: scaffold server.ts with MCP SDK; generate docs/architecture.mermaid
[ ] Phase 1: implement list_payers tool
[ ] Phase 2: seed-synthetic-payers.ts and seed-cms-data.ts scripts
[ ] Phase 2: implement get_coverage_policy tool + unit test
[ ] Phase 2: implement check_auth_requirements tool + unit test
[ ] Phase 3: implement flag_documentation_gaps tool + unit test
[ ] Phase 3: integration test: scenario-2-full-pipeline
[ ] Phase 4: Track 1 Claude Desktop config and scenario scripts
[ ] Phase 4: Track 2 LangGraph pipeline
[ ] Phase 4: README + interview-demo-guide.md
[ ] Phase 5: Track 3 UI (separate Claude Code session)
```

### 7.2 UI Companion Repo CLAUDE.md

```markdown
# CLAUDE.md — clinical-rules-ui

## Project Identity
Next.js review UI for the clinical-rules-mcp-server Track 3 demo.
Provides a human review interface for prior authorization determinations
produced by the LangGraph pipeline with HumanReviewNode.

## Bootstrap Origin
Scaffolded with Paul's /bootstrap command. The following files are from the
bootstrap and must NOT be modified or regenerated under any circumstances:
- components/theme-provider.tsx
- components/theme-toggle.tsx
- lib/utils.ts
- app/globals.css (add new tokens below the existing base layer only)

## Stack (pre-installed by bootstrap — do not reinstall or override)
- Next.js 16+ (App Router, TypeScript, Tailwind v4, Turbopack)
- shadcn/ui base-vega; 14 components available: alert, alert-dialog, badge,
  button, card, combobox, dropdown-menu, field, input, label, scroll-area,
  select, separator, textarea
- @hugeicons/react: use HugeiconsIcon wrapper for ALL icons
- Framer Motion: available for transitions
- next-themes: ThemeProvider already wired in layout.tsx
- OKLCH tokens: --brand (amber), --primary (blue), full semantic system
- Fonts: Raleway (sans), Playfair Display (font-display), Geist Mono (code)

## Component Rules (non-negotiable)
- ALL icon usage: <HugeiconsIcon icon={XxxIcon} className="h-4 w-4" />
- NEVER import from lucide-react
- Use cn() from lib/utils for all conditional className merging
- Card / CardHeader / CardContent for all panel containers
- Badge variant="destructive" for blocking doc gaps
- Badge variant="secondary" for advisory doc gaps
- No <form> HTML elements anywhere; use onClick / onChange handlers

## Screens
app/page.tsx               — Auth request submission form
app/review/[requestId]     — HumanReviewNode panel (fires for confidence < 0.8)
app/history                — Scrollable request history with status badges

## API Routes
POST app/api/auth-request/route.ts — triggers LangGraph pipeline server-side

## Data Flow
- Submission form POSTs to /api/auth-request
- API route runs LangGraph pipeline and streams structured response back
- HumanReviewNode interrupt-before fires if confidence < 0.8; UI polls
  /api/auth-request/[requestId]/status for updated state
- MCP server must be running on localhost:3001

## Active Work
[ ] auth-request-form.tsx
[ ] app/page.tsx submission screen
[ ] determination-card.tsx
[ ] gap-list.tsx with correct badge variants
[ ] app/review/[requestId]/page.tsx human review panel
[ ] app/api/auth-request/route.ts pipeline trigger
[ ] request-history-list.tsx
[ ] app/history/page.tsx history screen
[ ] lib/pipeline-client.ts fetch wrapper
```

---

## SECTION 8: README NARRATIVE

### 8.1 Header Block

```markdown
# clinical-rules-mcp-server

An MCP server that exposes payer-specific clinical authorization criteria
as structured, agent-consumable tools — designed to compose with Anthropic's
native Claude for Healthcare CMS Connector.

Anthropic's CMS Connector gives agents access to Medicare national and local
coverage determinations. That is the federal floor. Commercial payers,
Medicare Advantage plans, and Medicaid programs add their own criteria on top
of that baseline. A prior authorization agent that only knows what CMS covers
will produce incomplete determinations for the majority of real-world requests.
This server supplies the missing layer. It does not duplicate what Anthropic
already ships. It extends it.

**Demo Track:** Runs locally with zero API keys for Track 1 (Claude Desktop)
**Hyperscaler Track:** Not applicable; infrastructure-agnostic by design
**Related Repos:** [prior-auth-radar](https://github.com/paullopez-ai/prior-auth-radar) · [payer-auth-intelligence](https://github.com/paullopez-ai/payer-auth-intelligence) · [auth-agent-network](https://github.com/paullopez-ai/auth-agent-network)
```

### 8.2 Architecture Section

Reproduce the ASCII diagram from Section 2.1.

Follow with this paragraph:

The Anthropic connectors supply the federal baseline. This server supplies
the payer-specific overlay. The agent composes both layers to produce a
complete authorization assessment. Think of it like tax law: federal code
sets the floor, and state rules layer on top. A tax agent that only knows
federal code misfires on state returns. Prior authorization works the same
way, and this server is the state-and-local layer.

<!-- DIAGRAM: insert rendered architecture.mermaid image here -->

### 8.3 Demonstrated Capabilities

```markdown
### Specification Precision

> *From the Architect:* Every tool in this server is defined as a typed
> contract. Input schemas use Zod with field-level descriptions and
> classification rules. The gap analysis tool's system prompt specifies
> severity as an enum and defines a 0-100 completeness scoring rubric
> before a single token is generated. The goal was to make the tool boundary
> as explicit as a function signature: the caller knows exactly what to send,
> and the server knows exactly what to return.

**Key implementation:** [`src/tools/flag-documentation-gaps.ts`](src/tools/flag-documentation-gaps.ts) — strict output schema with severity enum, scoring rubric, and per-gap suggested language

---

### Multi-Agent Orchestration

> *From the Architect:* The Track 2 pipeline is where the server's
> architectural purpose becomes visible. `CoverageCheckNode` runs two
> knowledge queries in parallel: the Anthropic CMS Connector for federal
> ground truth and this server's `get_coverage_policy` for the payer overlay.
> The node merges both results before passing them downstream. The decomposition
> rationale is documented inline: each node boundary represents a distinct
> knowledge source or decision type.

**Key implementation:** [`demo/track-2-langgraph/pipeline.ts`](demo/track-2-langgraph/pipeline.ts) — four-node LangGraph StateGraph composing two knowledge layers

---

### Context Architecture

> *From the Architect:* The server is the context layer in the authorization
> agent stack. Rather than hardcoding payer criteria in prompts, every lookup
> is a targeted query against a structured knowledge store that separates
> federal NCD/LCD documents from payer-specific overlay rules. The gap analysis
> tool receives only the criteria relevant to the specific procedure and payer,
> not the full knowledge base, which keeps token usage proportional to the
> request.

**Key implementation:** [`src/db/schema.ts`](src/db/schema.ts) and [`src/db/queries/coverage.ts`](src/db/queries/coverage.ts) — normalized schema with targeted query layer
```

### 8.4 Demo Track Setup

Reproduce the exact commands from Section 3.4.

### 8.5 Hyperscaler Track Setup

Not applicable.

### 8.6 Interview Demo Guide

Content lives in `docs/interview-demo-guide.md`. The guide covers five
scenarios:
1. Track 1 (2 minutes): Start server, add to Claude Desktop, ask the CPT
   27447 coverage question, walk through the structured response.
2. Track 2 (5 minutes): Run Scenario 2 with MOCK_LLM=true, show the
   pipeline node sequence, explain the two-layer merge, trigger HumanReviewNode.
3. Architecture explanation (2 minutes): ASCII diagram walkthrough, CMS
   Connector vs. this server vs. agent roles.
4. Design decision questions: MCP vs. REST, why compose rather than replace.
5. Production path question: what changes to go to production (real criteria
   source, OAuth on endpoints).

---

## SECTION 9: BUILD SEQUENCE

### Phase 1: Foundation (Days 1-2)
- Scaffold repo; configure bun, TypeScript strict, Vitest
- Install `@modelcontextprotocol/sdk`, `better-sqlite3`, `zod`, `tsx`
- Implement `list_payers` tool (validates server boots and responds)
- Confirm: `curl http://localhost:3001` returns tool list
- Write CLAUDE.md; generate `docs/architecture.mermaid`; commit both

### Phase 2: Core Tools (Days 3-5)
- Write `scripts/seed-synthetic-payers.ts` and `scripts/seed-cms-data.ts`
- Implement SQLite schema and query layer (`src/db/`)
- Implement `get_coverage_policy` tool + unit test
- Implement `check_auth_requirements` tool + unit test
- Track 1 Claude Desktop config and Scenario 1 prompt documented

### Phase 3: Documentation Intelligence (Days 6-7)
- Implement `flag_documentation_gaps` tool + unit test
- Implement mock LLM mode (`MOCK_LLM=true` fixture in `data/mock-gap-analysis.json`)
- Integration test: `scenario-2-full-pipeline.test.ts` (all tools, MOCK_LLM=true)

### Phase 4: Track 2 + README (Days 8-10)
- Build Track 2 LangGraph pipeline (`demo/track-2-langgraph/pipeline.ts`)
- Scenario 2 and Scenario 3 confirmed with `MOCK_LLM=true`
- README complete through Section 8.5
- `docs/interview-demo-guide.md` written and validated
- Repo pushed to GitHub

### Phase 5: Track 3 UI (Days 11-13, separate Claude Code session)
- Manual pre-condition: `/bootstrap clinical-rules-ui` in `~/MyNewSoftware`
- New Claude Code session in `~/MyNewSoftware/clinical-rules-ui`
- Build all screens and API route per Sections 6.2 and 7.2
- End-to-end validation: MCP server running + LangGraph pipeline + UI

### Estimated Total Build Time: 13 focused days

---

## SECTION 10: SUCCESS CRITERIA

| Criterion | Definition of Done |
|-----------|-------------------|
| MCP server boots | `list_payers` responds in Claude Desktop; curl returns tool list |
| Core tools functional | All four tools return structured responses for Scenario 1 and 3 test cases |
| Data integrity | CMS data committed and documented in data-sources.md; synthetic data clearly labeled |
| Track 1 demo | Scenario 1 (CPT 27447 coverage lookup) completes in Claude Desktop in under 3 minutes, zero API keys |
| Track 2 demo | Scenario 2 (denial with HumanReviewNode) runs end to end with MOCK_LLM=true in under 2 minutes |
| `docs/architecture.mermaid` | Valid Mermaid syntax; renders cleanly in nano-banana |
| README quality | Any senior engineer can clone, seed, and run Track 1 in under 15 minutes |
| Test coverage | Unit tests for all four tools passing; scenario-2-full-pipeline integration test passing |
| CLAUDE.md current | All Active Work items checked off or explicitly deferred to Phase 5 |

---

## SECTION 11: DEPENDENCIES

### 11.1 MCP Server Dependencies
| Dependency | Version | Purpose |
|-----------|---------|---------|
| @modelcontextprotocol/sdk | latest | MCP server framework |
| better-sqlite3 | ^9.x | SQLite client for Node.js |
| zod | ^3.x | Input schema validation |
| @langchain/langgraph | latest | Track 2 pipeline |
| @anthropic-ai/sdk | latest | Internal LLM calls for flag_documentation_gaps |
| vitest | latest | Unit and integration testing |
| tsx | latest | TypeScript execution |

### 11.2 UI Companion Dependencies (pre-installed by bootstrap — do not reinstall)
| Dependency | Notes |
|-----------|-------|
| next 16+ | App Router, Turbopack |
| typescript | Strict mode |
| tailwindcss v4 | tw-animate-css included |
| shadcn/ui (base-vega) | 14 components pre-added |
| @hugeicons/react | HugeiconsIcon wrapper only; never lucide-react |
| framer-motion | Available for transitions |
| next-themes | ThemeProvider wired in layout.tsx |
| clsx + tailwind-merge | Via cn() in lib/utils |
| @base-ui/react | Headless primitives |

**External accounts required:**
- Demo track (Track 1): none
- Track 2+: Anthropic API key
- Bedrock option: AWS account (optional, set USE_BEDROCK=true)

---

## SECTION 12: CONSTRAINTS

**Always applicable:**
- No proprietary, PHI, or real patient data at any stage of development
- All external data must be public domain CMS sources or clearly labeled synthetic
- All development on personal equipment only
- Healthcare vertical not referenced in Skygile public materials until after UHG departure
- No `<form>` HTML elements in any UI repo; use onClick / onChange handlers
- No lucide-react icons; use HugeiconsIcon wrapper from @hugeicons/react
- This prototype is a portfolio and interview asset; not intended for production deployment
- Do not add this prototype to `provider-api-ai-poc-index`; it will be catalogued in a new collection index to be created separately

**Prototype-specific:**
- No Optum internal systems, APIs, or knowledge referenced anywhere in this repo
- No GCP dependency; A2A is infrastructure-agnostic over standard HTTP
- Agent communication must go through A2A protocol exclusively; no direct imports between provider and payer agent code

---

## SECTION 13: RELATIONSHIP TO EXISTING REPOS

| Repo | Relationship |
|------|-------------|
| `prior-auth-radar` | Provider-side domain model and denial risk signal patterns inform the synthetic scenario data |
| `payer-auth-intelligence` | HumanReviewNode interrupt-before pattern and four-node pipeline structure are the basis for Track 2 |
| `auth-agent-network` | Calls this server as optional MCP dependency in CriteriaLookupNode |

Note: This prototype is not added to `provider-api-ai-poc-index`. A new
collection index for post-Optum prototypes will be created separately.

---

## SECTION 14: OPEN QUESTIONS

| # | Question | Owner | Status |
|---|---------|-------|-------|
| 1 | Should Track 1 document the Anthropic CMS Connector as a prerequisite or treat it as optional context for the demo narrative? | Paul | Open |
| 2 | Should `flag_documentation_gaps` call Claude inline (current design) or should that LLM call move to the LangGraph pipeline's DocumentationAuditNode to keep the MCP server stateless? | Paul | Open — see Section 2.4 Decision 3 |
