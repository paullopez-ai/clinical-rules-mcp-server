/**
 * Resilient client for this server's get_coverage_policy tool.
 *
 * Skill 3 decomposition note: CoverageCheckNode must never hard-fail on a
 * missing dependency. This client first tries the running MCP server over HTTP;
 * if the server is not up, it falls back to the embedded in-process tool, which
 * reads the same seeded knowledge store. Either way the node gets an answer.
 */
import { getCoveragePolicyTool } from "../../src/tools/index.js";
import type { GetCoveragePolicyOutput } from "../../src/tools/get-coverage-policy.js";

const MCP_URL = `http://localhost:${process.env.MCP_PORT ?? 3001}/mcp`;

export interface CoverageLookup {
  result: GetCoveragePolicyOutput;
  via: "mcp-http" | "embedded-fallback";
}

export async function getCoveragePolicyResilient(args: {
  cpt_code: string;
  payer_id: string;
}): Promise<CoverageLookup> {
  try {
    const result = await callMcpTool("get_coverage_policy", args);
    return { result: result as GetCoveragePolicyOutput, via: "mcp-http" };
  } catch {
    // Embedded fallback — pipeline never hard-fails on a missing server.
    const result = getCoveragePolicyTool.run(args);
    return { result, via: "embedded-fallback" };
  }
}

async function callMcpTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: args },
    }),
    signal: AbortSignal.timeout(1500),
  });
  if (!res.ok) throw new Error(`MCP HTTP ${res.status}`);

  // The stateless server replies with JSON (enableJsonResponse).
  const body = (await res.json()) as {
    result?: { structuredContent?: unknown; content?: Array<{ text?: string }> };
    error?: { message?: string };
  };
  if (body.error) throw new Error(body.error.message ?? "MCP error");
  const sc = body.result?.structuredContent;
  if (sc) return sc;
  const text = body.result?.content?.[0]?.text;
  if (text) return JSON.parse(text);
  throw new Error("MCP response had no parseable content");
}
