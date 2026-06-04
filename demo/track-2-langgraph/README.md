# Track 2 — LangGraph pipeline

A four-node LangGraph `StateGraph` that composes **two knowledge layers** to
produce a prior-authorization determination, with a human-in-the-loop trust
boundary.

```
AuthRequestNode → CoverageCheckNode → DocumentationAuditNode → DeterminationNode
                         │                       │                     │
              CMS Connector (stub) +     flag_documentation_gaps   confidence < 0.8
              get_coverage_policy                                       │
              merged via Promise.all                              HumanReviewNode
                                                                  (interrupt-before)
```

## Run it

```bash
MOCK_LLM=true npx tsx demo/track-2-langgraph/pipeline.ts
```

No API key needed with `MOCK_LLM=true`. The run prints both scenarios in ~10s.

To use live Claude reasoning inside `flag_documentation_gaps`:

```bash
MOCK_LLM=false ANTHROPIC_API_KEY=sk-ant-... npx tsx demo/track-2-langgraph/pipeline.ts
```

## What each node does

| Node | Responsibility | Knowledge source |
|------|----------------|------------------|
| `AuthRequestNode` | Normalize / log the request | — |
| `CoverageCheckNode` | **Parallel** federal + payer lookup, merged | CMS Connector stub **and** `get_coverage_policy` |
| `DocumentationAuditNode` | Gap analysis against the criteria slice | `flag_documentation_gaps` |
| `DeterminationNode` | Confidence score + routing | computed |
| `HumanReviewNode` | Interrupt-before trust boundary (`< 0.8`) | human |

## Scenarios (PRD 3.3)

- **Scenario 2 — denial path.** CPT 27447, ICD-10 M17.11, `PAYER_MEDICARE_ADV_B`,
  notes missing the conservative-treatment history → completeness 56, blocking
  gaps → **confidence 0.62** → `HumanReviewNode` fires → reviewer denies.
- **Scenario 3 — clean approval.** CPT 99213, ICD-10 J06.9, `PAYER_COMMERCIAL_A`,
  complete notes → completeness 95 → **confidence 0.91** → auto-approved, no
  `HumanReviewNode`.

## Resilience (Skill 3)

`CoverageCheckNode`'s call to this server goes through
[`mcp-client.ts`](./mcp-client.ts): it tries the running MCP server over HTTP
first and falls back to the **embedded in-process tool** if the server is not
up. The pipeline never hard-fails on a missing dependency. The run log reports
which path was taken (`via mcp-http` vs `via embedded-fallback`).

## Confidence rubric (deterministic)

```
confidence = 0.20 + 0.75 * (completeness_score / 100)
           − 0.20 if no coverage policy found
           − 0.05 if no exact auth-rule match
(rounded to 2 decimals, clamped to [0,1])
```

## Notes on the CMS Connector

In production the federal NCD/LCD baseline comes from Anthropic's native CMS
Connector. That connector is not callable as a plain library outside the Claude
runtime, so [`cms-connector-stub.ts`](./cms-connector-stub.ts) reads the same
public-domain CMS data this repo caches. Track 2's point is the **composition**,
not which process fetches the federal layer.
