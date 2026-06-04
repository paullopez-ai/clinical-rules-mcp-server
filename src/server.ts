/**
 * clinical-rules-mcp-server — MCP server entry point and tool registration.
 *
 * Exposes four tools over Streamable HTTP at POST /mcp, plus a plain GET /
 * health route that returns the tool catalog as JSON (the Phase-1 curl check).
 *
 * Composition note: this server supplies the payer-specific overlay layer. It
 * is designed to be called alongside Anthropic's native CMS Connector, which
 * supplies the federal NCD/LCD baseline. Neither is sufficient alone.
 */
import express, { type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { TOOLS } from "./tools/index.js";
import type { ToolDefinition } from "./types/mcp.js";

const PORT = Number(process.env.MCP_PORT ?? 3001);

/** Register every tool on a fresh McpServer instance. */
export function buildMcpServer(): McpServer {
  const server = new McpServer({
    name: "clinical-rules-mcp-server",
    version: "0.1.0",
  });

  for (const tool of TOOLS as ToolDefinition[]) {
    server.registerTool(tool.name, tool.config, async (args: unknown) => {
      try {
        const result = await tool.run(args);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          structuredContent: result as Record<string, unknown>,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error in ${tool.name}: ${message}` }],
        };
      }
    });
  }

  return server;
}

/** Build the Express app (exported so it can be exercised in integration tests). */
export function buildApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Plain catalog route — the zero-protocol curl check from PRD Section 9.
  const catalog = {
    name: "clinical-rules-mcp-server",
    version: "0.1.0",
    transport: { mcp: "POST /mcp (Streamable HTTP)" },
    tools: TOOLS.map((t) => ({
      name: t.name,
      title: t.config.title,
      description: t.config.description,
      input: Object.fromEntries(
        Object.entries(t.config.inputSchema).map(([k, v]) => [
          k,
          (v as z.ZodTypeAny).description ?? "",
        ]),
      ),
    })),
  };
  app.get(["/", "/health"], (_req: Request, res: Response) => {
    res.json(catalog);
  });

  // Stateless Streamable HTTP MCP endpoint: a fresh server+transport per
  // request avoids cross-request id collisions.
  app.post("/mcp", async (req: Request, res: Response) => {
    const server = buildMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // GET/DELETE on /mcp have no session in stateless mode.
  app.get("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed (stateless server)." },
      id: null,
    });
  });

  return app;
}

// Start only when run directly (not when imported by a test).
const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  const app = buildApp();
  app.listen(PORT, () => {
    console.log(`clinical-rules-mcp-server listening on http://localhost:${PORT}`);
    console.log(`  MCP endpoint:  POST http://localhost:${PORT}/mcp`);
    console.log(`  Tool catalog:  GET  http://localhost:${PORT}/health`);
    console.log(`  Tools: ${TOOLS.map((t) => t.name).join(", ")}`);
    if (process.env.MOCK_LLM === "true") {
      console.log("  MOCK_LLM=true — flag_documentation_gaps returns the fixture.");
    }
  });
}
