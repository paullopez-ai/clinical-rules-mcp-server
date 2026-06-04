import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { initSchema } from "./schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the SQLite knowledge store. */
export const DB_PATH =
  process.env.CLINICAL_RULES_DB ??
  resolve(__dirname, "../../data/clinical-rules.db");

let _db: Database.Database | null = null;

/**
 * Open (once) and return the knowledge-store connection. The schema is created
 * on first open so the server and tests work even before the seed scripts run
 * — the tables are simply empty until seeded.
 */
export function getDb(): Database.Database {
  if (_db) return _db;
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  _db = db;
  return db;
}

/** Close the connection (used by tests and graceful shutdown). */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
