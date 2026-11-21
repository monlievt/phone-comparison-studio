// packages/core/src/db/migrate.ts
// Applies numbered SQL migration files in order on startup.
// Works with better-sqlite3 (synchronous). Called from apps/worker and apps/web.

import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '../migrations');

export function migrate(db: Database.Database): void {
  // Ensure migration tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set<string>(
    (db.prepare('SELECT filename FROM _migrations ORDER BY id').all() as { filename: string }[])
      .map((r) => r.filename)
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    db.exec(sql);
    db.prepare('INSERT INTO _migrations(filename, applied_at) VALUES (?, ?)').run(
      file,
      new Date().toISOString()
    );
    console.log(`[migrate] Applied: ${file}`);
  }
}

export function openDb(dataDir: string): Database.Database {
  const dbPath = join(dataDir, 'app.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}
