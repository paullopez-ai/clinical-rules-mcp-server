import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { mkdtempSync } from "node:fs";

/**
 * Point every test at an isolated, freshly-seeded SQLite store. The env var is
 * set BEFORE any project module is imported so src/db/client.ts picks it up
 * when it computes DB_PATH. The seed scripts run at import time against this
 * temp DB, then close their connection; the tools reopen it on demand.
 *
 * MOCK_LLM is forced on by vitest.config.ts, so no test ever calls a model.
 */
const dir = mkdtempSync(resolve(tmpdir(), "clinical-rules-test-"));
process.env.CLINICAL_RULES_DB = resolve(dir, "test.db");
process.env.MOCK_LLM = "true";

await import("../scripts/seed-cms-data.js");
await import("../scripts/seed-synthetic-payers.js");
