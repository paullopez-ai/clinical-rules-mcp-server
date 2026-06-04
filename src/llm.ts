/**
 * Thin Claude access layer for flag_documentation_gaps — the only tool that
 * calls a model. Everything else in this server is a pure database query.
 *
 * Three modes, selected by environment:
 *   MOCK_LLM=true    → no network call at all (handled by the caller)
 *   USE_BEDROCK=true → route through AWS Bedrock (model endpoint only; no infra)
 *   default          → direct Anthropic API
 */

export interface LlmMessage {
  system: string;
  user: string;
  model: string;
  maxTokens?: number;
}

/** Returns the model's raw text completion. */
export async function completeJson(msg: LlmMessage): Promise<string> {
  if (process.env.USE_BEDROCK === "true") {
    return completeViaBedrock(msg);
  }
  return completeViaAnthropic(msg);
}

async function completeViaAnthropic(msg: LlmMessage): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is required when MOCK_LLM is not 'true'. " +
        "Set MOCK_LLM=true to use the deterministic fixture instead.",
    );
  }
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: msg.model,
    max_tokens: msg.maxTokens ?? 1024,
    system: msg.system,
    messages: [{ role: "user", content: msg.user }],
  });
  return res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
}

async function completeViaBedrock(msg: LlmMessage): Promise<string> {
  let BedrockCtor: unknown;
  // Variable specifier so TS does not statically resolve this optional dep.
  const moduleName = "@anthropic-ai/bedrock-sdk";
  try {
    ({ AnthropicBedrock: BedrockCtor } = (await import(moduleName)) as {
      AnthropicBedrock: unknown;
    });
  } catch {
    throw new Error(
      "USE_BEDROCK=true requires the optional '@anthropic-ai/bedrock-sdk' package. " +
        "Install it, or unset USE_BEDROCK to use the direct Anthropic API.",
    );
  }
  const client = new (BedrockCtor as new () => {
    messages: {
      create(args: unknown): Promise<{
        content: Array<{ type: string; text?: string }>;
      }>;
    };
  })();
  const res = await client.messages.create({
    model: msg.model,
    max_tokens: msg.maxTokens ?? 1024,
    system: msg.system,
    messages: [{ role: "user", content: msg.user }],
  });
  return res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}
