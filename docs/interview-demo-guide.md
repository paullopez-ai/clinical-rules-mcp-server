# Interview Demo Guide — clinical-rules-mcp-server

A tight ~11-minute walkthrough. The headline: **this repo authors an MCP server,
it does not merely consume one.** It supplies the payer-overlay knowledge layer
that Anthropic's CMS Connector is not designed to cover.

---

## 0. One-line setup (before the call)

```bash
npm install && npm run seed
```

---

## 1. Track 1 — Claude Desktop (2 minutes)

1. `MOCK_LLM=true npm start` → server on `http://localhost:3001`.
2. Show `curl http://localhost:3001/health` returning the four-tool catalog.
3. In Claude Desktop (connector already configured — see
   `demo/track-1-claude-desktop/`), ask:
   > *"Does PAYER_COMMERCIAL_A require prior auth for CPT 27447 for ICD-10 M17.11?"*
4. Walk through the **structured** response: `covered_with_prior_auth`, the
   payer's 12-week conservative-therapy overlay, and the federal LCD `L33456`
   it sits on top of.

**Point to make:** zero infrastructure, zero API keys. The response is a typed
contract, not free text the agent had to interpret.

---

## 2. Track 2 — LangGraph pipeline (5 minutes)

```bash
MOCK_LLM=true npx tsx demo/track-2-langgraph/pipeline.ts
```

Narrate the node sequence as it prints:

1. `CoverageCheckNode` runs **two queries in parallel** — the CMS Connector
   (federal baseline) and `get_coverage_policy` (payer overlay) — and merges
   them. Note the `via mcp-http` / `via embedded-fallback` line: the pipeline
   degrades gracefully if the server is down.
2. `DocumentationAuditNode` calls `flag_documentation_gaps`; the notes are
   missing the conservative-management history → **blocking gap**, completeness
   56.
3. `DeterminationNode` computes **confidence 0.62**.
4. `0.62 < 0.8` → `HumanReviewNode` **interrupt-before** fires; the graph pauses
   and surfaces the determination. The reviewer denies; the decision is recorded.
5. Contrast with **Scenario 3** (99213, clean notes) → **confidence 0.91** →
   auto-approved, no human review.

**Point to make:** each node boundary is a distinct knowledge source or decision
type. The two-layer merge (federal + payer) is the whole reason the server
exists, and the confidence threshold is an explicit, auditable trust boundary.

---

## 3. Architecture explanation (2 minutes)

Open `docs/architecture.mermaid` (or the rendered image in the README).

- **CMS Connector** (Anthropic native) = federal floor: NCD/LCD.
- **This server** = payer overlay: commercial / MA / Medicaid criteria on top.
- **The agent** composes both.

The tax-law analogy lands well: federal code sets the floor, state rules layer
on top; an agent that only knows federal code misfires on state returns. CPT
27447 has **no NCD** on purpose — major joint replacement really is governed by
LCDs plus payer policy, so it is the perfect illustration of why the overlay is
required.

---

## 4. Design-decision questions (be ready for)

- **MCP vs REST?** Publishing criteria as MCP tools means any MCP-compatible
  runtime consumes them with no custom integration. Trade-off: MCP tooling is
  younger; Claude Desktop is the primary, well-supported client.
- **Why compose with the CMS Connector instead of replacing it?** The connector
  already handles NCD/LCD retrieval well. Duplicating it would be wasteful and
  would drift from CMS ground truth. The overlay is the genuinely missing piece.
- **Why is `flag_documentation_gaps` the only LLM tool?** Everything else is a
  deterministic database query and should stay that way — cheap, fast, testable.
  Gap detection over free-text notes is the one place an LLM earns its keep, and
  even there the criteria are retrieved structurally first (token budget capped
  to the request slice).

---

## 5. Production path (what changes)

- Swap the synthetic payer JSON for a real, governed criteria source; keep the
  same schema (already Postgres-compatible).
- Put OAuth / mTLS on the MCP endpoint; today it is open localhost.
- Move the SQLite store to Postgres (no schema migration needed).
- Add audit-log persistence for determinations (confidence, attribution,
  timestamp are already emitted).
- Decide Open Question #2: keep the LLM call inside the tool, or move it to the
  pipeline's `DocumentationAuditNode` to keep the server stateless.

---

## Quick reference — the four tools

| Tool | Calls a model? | Returns |
|------|----------------|---------|
| `list_payers` | no | payer catalog |
| `get_coverage_policy` | no | coverage status + payer overlay + federal NCD/LCD |
| `check_auth_requirements` | no | auth-required flag + criteria list + decision days |
| `flag_documentation_gaps` | yes (or mock) | completeness score + classified gaps |
