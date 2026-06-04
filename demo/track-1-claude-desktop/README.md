# Track 1 — Claude Desktop (zero infrastructure)

The simplest, most visually unambiguous demo: run this MCP server locally and
call it from Claude Desktop. **No API keys required** — the tools used here
(`list_payers`, `get_coverage_policy`, `check_auth_requirements`) are pure
database queries.

## 1. Start the server

```bash
npm install
npm run seed            # one-time; CMS data is already cached in data/
MOCK_LLM=true npm start
# clinical-rules-mcp-server listening on http://localhost:3001
```

Confirm it is up:

```bash
curl http://localhost:3001/health
```

## 2. Add it to Claude Desktop

This server speaks **Streamable HTTP** at `POST http://localhost:3001/mcp`.
Claude Desktop launches MCP servers as local processes, so the most reliable
wiring is the `mcp-remote` bridge.

Edit `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "clinical-rules": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3001/mcp"]
    }
  }
}
```

> Prefer launching the server from Claude Desktop directly (stdio)? You can
> instead point `command` at `npx`/`tsx` running `src/server.ts`, but the HTTP
> bridge above keeps one server process serving every client.

Restart Claude Desktop. The four tools appear under the connector.

## 3. Scenario 1 — Coverage policy lookup

Ask Claude Desktop:

> **"Does PAYER_COMMERCIAL_A require prior auth for CPT 27447 for ICD-10 M17.11?"**

Expected behavior:

1. Claude calls `get_coverage_policy(cpt_code="27447", payer_id="PAYER_COMMERCIAL_A")`.
2. The tool returns `coverage_status = covered_with_prior_auth`, the payer
   overlay (12-week conservative-therapy requirement), and the federal LCD
   (`L33456`, Major Joint Replacement) it composes with.
3. Claude may also call `check_auth_requirements` to enumerate the criteria.
4. Claude explains, in natural language, that the procedure is covered **with
   prior authorization** and lists what the payer requires on top of the CMS
   baseline.

### Other prompts to try

- "List the payers this server knows about." → `list_payers`
- "What does PAYER_MEDICARE_ADV_B require for a total knee replacement?" →
  shows the **stricter 24-week** overlay, contrasting with Commercial A.
- "Is a 99213 office visit covered by PAYER_COMMERCIAL_A without prior auth?" →
  `covered_no_auth`.

## What this demonstrates

- **MCP server authorship** (not consumption) in the simplest possible form.
- The **two-layer architecture**: the payer overlay returned here is exactly
  what Anthropic's CMS Connector does *not* provide.
- A **typed tool contract** — the response is structured, not free text.
