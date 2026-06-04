import { z } from "zod";
import type { ToolDefinition } from "../types/mcp.js";
import type { Payer } from "../types/coverage.js";
import { listPayers } from "../db/queries/coverage.js";

/**
 * list_payers — enumerate the payers whose overlay criteria this server hosts.
 *
 * Pure database query; needs no API key. This is the Phase-1 boot validator:
 * if this tool responds, the server is wired correctly.
 */

export interface ListPayersOutput {
  count: number;
  payers: Payer[];
}

const outputShape = {
  count: z.number().int().describe("Number of payers in the knowledge store."),
  payers: z
    .array(
      z.object({
        payer_id: z.string(),
        payer_name: z.string(),
        plan_types: z.array(z.string()),
        cpt_domains: z.array(z.string()),
        cms_baseline_override: z.boolean(),
      }),
    )
    .describe("Every payer profile, with its plan types and CPT domains."),
};

export const listPayersTool = {
  name: "list_payers",
  config: {
    title: "List payers",
    description:
      "List all payers whose clinical authorization overlay criteria are available in this knowledge store. Returns each payer's id, display name, supported plan types, and the CPT domains it covers. Takes no arguments. Requires no API key.",
    inputSchema: {},
    outputSchema: outputShape,
  },
  run(): ListPayersOutput {
    const payers = listPayers();
    return { count: payers.length, payers };
  },
} satisfies ToolDefinition<Record<string, never>, ListPayersOutput>;
