# CLAUDE.md — clinical-rules-mcp-server

## Project Identity
MCP server that exposes payer clinical authorization criteria as
agent-consumable tools. Designed to compose with Anthropic's native
Claude for Healthcare CMS Connector. The CMS Connector supplies the
federal NCD/LCD baseline; this server supplies the payer-specific
overlay. Neither is sufficient alone for a real authorization determination.

## Stack
- Runtime: Node.js / TypeScript (run with tsx; bun also works)
- MCP SDK: @modelcontextprotocol/sdk (Streamable HTTP transport)
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
- src/server.ts: MCP server bootstrap and tool registration
- src/tools/: One file per tool, self-contained
- src/db/: Schema and query layer only, no business logic
- scripts/: Seed scripts (hash-keyed incremental ingestion)
- data/: Seeded by seed scripts; do not hand-edit JSON files after seeding
- demo/: Standalone demo scripts
- docs/architecture.mermaid: Build artifact; consumed by nano-banana

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
docs/architecture.mermaid uses `graph TD` layout. nano-banana reads it to
render the README diagram.

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
[x] Phase 1: scaffold server.ts with MCP SDK; generate docs/architecture.mermaid
[x] Phase 1: implement list_payers tool
[x] Phase 2: seed-synthetic-payers.ts and seed-cms-data.ts scripts
[x] Phase 2: implement get_coverage_policy tool + unit test
[x] Phase 2: implement check_auth_requirements tool + unit test
[x] Phase 3: implement flag_documentation_gaps tool + unit test
[x] Phase 3: integration test: scenario-2-full-pipeline
[x] Phase 4: Track 1 Claude Desktop config and scenario scripts
[x] Phase 4: Track 2 LangGraph pipeline
[x] Phase 4: README + interview-demo-guide.md
[ ] Phase 5: Track 3 UI (separate Claude Code session — see clinical-rules-ui)
