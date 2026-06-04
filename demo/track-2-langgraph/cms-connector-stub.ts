/**
 * Stand-in for Anthropic's native Claude for Healthcare CMS Connector.
 *
 * In a real Claude Desktop / pipeline deployment the federal NCD/LCD baseline
 * comes from Anthropic's connector. That connector is not callable as a plain
 * library outside the Claude runtime, so for a self-contained, runnable demo we
 * read the same public-domain CMS data this repo caches in data/. The point of
 * Track 2 is the *composition* — federal baseline + payer overlay — not which
 * process physically fetches the federal layer.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { LcdDocument, NcdDocument } from "../../src/types/coverage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, "../../data");

export interface CmsBaseline {
  source: "anthropic-cms-connector (stub)";
  cpt_code: string;
  ncds: NcdDocument[];
  lcds: LcdDocument[];
  note: string;
}

/** Return the federal NCD/LCD documents relevant to a CPT code. */
export async function cmsConnectorLookup(cptCode: string): Promise<CmsBaseline> {
  const ncds = (
    JSON.parse(readFileSync(resolve(dataDir, "cms-ncds.json"), "utf8")) as {
      ncds: NcdDocument[];
    }
  ).ncds;
  const lcds = (
    JSON.parse(readFileSync(resolve(dataDir, "cms-lcds.json"), "utf8")) as {
      lcds: LcdDocument[];
    }
  ).lcds;

  // Coarse relevance filter: NCDs/LCDs whose summary or title references the CPT
  // or the major-joint-replacement domain (27447 has no NCD by design).
  const matchesCpt = (text: string) =>
    text.includes(cptCode) ||
    (cptCode === "27447" && /knee|joint replacement|arthroplasty/i.test(text));

  return {
    source: "anthropic-cms-connector (stub)",
    cpt_code: cptCode,
    ncds: ncds.filter((n) => matchesCpt(`${n.title} ${n.summary}`)),
    lcds: lcds.filter((l) => matchesCpt(`${l.title} ${l.summary}`)),
    note: "Federal baseline only. Payer-specific criteria are NOT included here — that is the overlay layer this MCP server supplies.",
  };
}
