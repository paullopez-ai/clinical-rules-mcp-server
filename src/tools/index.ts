import type { ToolDefinition } from "../types/mcp.js";
import { listPayersTool } from "./list-payers.js";
import { getCoveragePolicyTool } from "./get-coverage-policy.js";
import { checkAuthRequirementsTool } from "./check-auth-requirements.js";
import { flagDocumentationGapsTool } from "./flag-documentation-gaps.js";

/** Every tool this server exposes, in build-priority order. */
export const TOOLS: ToolDefinition<any, any>[] = [
  listPayersTool,
  getCoveragePolicyTool,
  checkAuthRequirementsTool,
  flagDocumentationGapsTool,
];

export {
  listPayersTool,
  getCoveragePolicyTool,
  checkAuthRequirementsTool,
  flagDocumentationGapsTool,
};
