import { createHash } from "node:crypto";
import type Database from "better-sqlite3";

/** Stable content hash for one record (incremental-ingestion key). */
export function hashRecord(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Returns true if the record changed since the last seed (or is new), and
 * records the new hash. Lets seed scripts upsert only changed rows so a
 * re-seed re-indexes the delta, not the full corpus (Skill 6).
 */
export function hasChanged(
  db: Database.Database,
  recordKey: string,
  content: unknown,
): boolean {
  const hash = hashRecord(content);
  const existing = db
    .prepare(`SELECT content_hash FROM _seed_hashes WHERE record_key = ?`)
    .get(recordKey) as { content_hash: string } | undefined;

  if (existing?.content_hash === hash) return false;

  db.prepare(
    `INSERT INTO _seed_hashes (record_key, content_hash) VALUES (?, ?)
       ON CONFLICT(record_key) DO UPDATE SET content_hash = excluded.content_hash`,
  ).run(recordKey, hash);
  return true;
}
