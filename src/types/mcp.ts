import type { ZodRawShape } from "zod";

/**
 * Shared shape for a self-contained MCP tool module. Each tool file in
 * src/tools/ exports a `ToolDefinition` so the server can register all of
 * them uniformly, and so tests can exercise the pure `run` logic without an
 * HTTP transport.
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  config: {
    title: string;
    description: string;
    inputSchema: ZodRawShape;
    outputSchema?: ZodRawShape;
  };
  /** Pure business logic: validated input in, typed structured output out. */
  run(input: TInput): Promise<TOutput> | TOutput;
}
