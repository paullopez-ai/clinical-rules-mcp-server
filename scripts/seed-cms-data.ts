/**
 * Seed the federal CMS baseline (NCD + LCD documents) from the cached,
 * committed public-domain JSON in data/. No live CMS API call is made — the
 * data is cached so Track 1 is zero-infrastructure (PRD Section 3.1).
 *
 * Incremental ingestion: a content-hash check (Skill 6) means only changed
 * records are written on a re-seed.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getDb, closeDb } from "../src/db/client.js";
import { hasChanged } from "./seed-utils.js";
import type { LcdDocument, NcdDocument } from "../src/types/coverage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, "../data");

function load<T>(file: string): T {
  return JSON.parse(readFileSync(resolve(dataDir, file), "utf8")) as T;
}

function seed(): void {
  const db = getDb();
  const ncds = load<{ ncds: NcdDocument[] }>("cms-ncds.json").ncds;
  const lcds = load<{ lcds: LcdDocument[] }>("cms-lcds.json").lcds;

  const upsertNcd = db.prepare(
    `INSERT INTO ncd_documents (ncd_id, title, effective_date, summary, full_text_url)
       VALUES (@ncd_id, @title, @effective_date, @summary, @full_text_url)
       ON CONFLICT(ncd_id) DO UPDATE SET
         title=excluded.title, effective_date=excluded.effective_date,
         summary=excluded.summary, full_text_url=excluded.full_text_url`,
  );

  const upsertLcd = db.prepare(
    `INSERT INTO lcd_documents (lcd_id, contractor_name, title, effective_date, summary, states_covered)
       VALUES (@lcd_id, @contractor_name, @title, @effective_date, @summary, @states_covered)
       ON CONFLICT(lcd_id) DO UPDATE SET
         contractor_name=excluded.contractor_name, title=excluded.title,
         effective_date=excluded.effective_date, summary=excluded.summary,
         states_covered=excluded.states_covered`,
  );

  let ncdWrites = 0;
  let lcdWrites = 0;

  const run = db.transaction(() => {
    for (const ncd of ncds) {
      if (hasChanged(db, `ncd:${ncd.ncd_id}`, ncd)) {
        upsertNcd.run(ncd);
        ncdWrites++;
      }
    }
    for (const lcd of lcds) {
      if (hasChanged(db, `lcd:${lcd.lcd_id}`, lcd)) {
        upsertLcd.run({ ...lcd, states_covered: JSON.stringify(lcd.states_covered) });
        lcdWrites++;
      }
    }
  });
  run();

  console.log(
    `[seed-cms-data] NCDs: ${ncdWrites}/${ncds.length} written (rest unchanged); ` +
      `LCDs: ${lcdWrites}/${lcds.length} written (rest unchanged).`,
  );
  closeDb();
}

seed();
