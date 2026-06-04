# Track 3 — Full-stack review UI (separate session)

Track 3 is the **`clinical-rules-ui`** companion repo (Next.js 16 review UI),
built in a **separate Claude Code session** per PRD Section 9, Phase 5. It is
**not** part of this server repo's build.

## What lives where

- **This repo** provides the runnable pipeline the UI drives. The UI's
  `app/api/auth-request/route.ts` triggers the same LangGraph pipeline shipped
  in [`../track-2-langgraph/pipeline.ts`](../track-2-langgraph/pipeline.ts)
  (with the `HumanReviewNode` interrupt-before boundary).
- **`clinical-rules-ui`** (`~/MyNewSoftware/clinical-rules-ui`) provides the
  three screens: submission form, human-review panel, request history.

## Pre-conditions for the Phase 5 session

1. `/bootstrap clinical-rules-ui` in `~/MyNewSoftware` (Paul's bootstrap).
2. This MCP server running on `localhost:3001`.
3. Build screens + API route per PRD Sections 6.2 and 7.2.

## Why no CDK here

The PRD's optional `cdk/` stack is explicitly **not required for any demo**
(PRD 6.1, Section 4). This prototype is infrastructure-agnostic; no cloud
account is needed for Tracks 1–3. The directory is intentionally left empty.
