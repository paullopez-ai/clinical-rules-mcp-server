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

---

## Architecture

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
            ├── get_coverage_policy(cpt_code, payer_id)
            ├── check_auth_requirements(procedure, dx, plan)
            ├── flag_documentation_gaps(notes, criteria_result)
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
```

The Anthropic connectors supply the federal baseline. This server supplies
the payer-specific overlay. The agent composes both layers to produce a
complete authorization assessment. Think of it like tax law: federal code
sets the floor, and state rules layer on top. A tax agent that only knows
federal code misfires on state returns. Prior authorization works the same
way, and this server is the state-and-local layer.

<!-- DIAGRAM: insert rendered architecture.mermaid image here -->

> The machine-readable source for the rendered diagram lives at
> [`docs/architecture.mermaid`](docs/architecture.mermaid) (`graph TD`).

---

## Demonstrated Capabilities

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

---

## The four tools

| Tool | Calls a model? | Returns |
|------|----------------|---------|
| `list_payers` | no | the payer catalog |
| `get_coverage_policy` | no | coverage status + payer overlay + federal NCD/LCD baseline |
| `check_auth_requirements` | no | auth-required flag + criteria list + decision turnaround |
| `flag_documentation_gaps` | yes (or deterministic mock) | 0-100 completeness score + gaps classified blocking/advisory |

Every tool returns a **typed `structuredContent` contract** — a consuming
pipeline reads it with no parsing or normalization layer.

---

## Demo Track Setup

```bash
# Clone and install
git clone https://github.com/paullopez-ai/clinical-rules-mcp-server
cd clinical-rules-mcp-server
npm install                       # (bun install also works)

# Seed knowledge base (one-time; CMS data already cached in data/)
npm run seed                      # = seed-cms-data + seed-synthetic-payers

# Start MCP server (Track 1)
MOCK_LLM=true npm start
# Server running at http://localhost:3001
# Add to Claude Desktop claude_desktop_config.json, then ask:
# "Does PAYER_COMMERCIAL_A require prior auth for CPT 27447 for ICD-10 M17.11?"

# Run Track 2 LangGraph pipeline (requires ANTHROPIC_API_KEY or MOCK_LLM=true)
MOCK_LLM=true npx tsx demo/track-2-langgraph/pipeline.ts
# Expected: structured determination printed to terminal in ~10 seconds
```

> Prefer bun? Substitute `bun install` and `bun run src/server.ts` /
> `bun run demo/track-2-langgraph/pipeline.ts`. The toolchain is runtime-neutral.

Quick health check (no MCP client needed):

```bash
curl http://localhost:3001/health      # returns the four-tool catalog as JSON
```

### Track-specific guides

- **Track 1 (Claude Desktop):** [`demo/track-1-claude-desktop/`](demo/track-1-claude-desktop/)
- **Track 2 (LangGraph):** [`demo/track-2-langgraph/`](demo/track-2-langgraph/)

### Tests

```bash
npm test     # 16 tests; MOCK_LLM forced on — never calls a real model
```

---

## Hyperscaler Track Setup

Not applicable. The MCP server's core value is protocol architecture and
knowledge-layer design, both intentionally infrastructure-agnostic. The Track 2
pipeline runs on Node.js with only an Anthropic API key (or `MOCK_LLM=true`).
AWS Bedrock routing is available for Track 2 via `USE_BEDROCK=true`; this only
changes the model endpoint and provisions no infrastructure.

---

## Interview Demo Guide

A five-part walkthrough (Track 1, Track 2, architecture, design-decision Q&A,
production path) lives in
[`docs/interview-demo-guide.md`](docs/interview-demo-guide.md).

---

## Data & Provenance

Only public-domain CMS data and clearly-labeled synthetic data are used. **No
proprietary, PHI, or real patient data appears anywhere.** Full provenance:
[`docs/data-sources.md`](docs/data-sources.md).

---

## License

MIT. CMS source material is public domain (17 U.S.C. § 105). Synthetic payer
data is fictional and for demonstration only.
