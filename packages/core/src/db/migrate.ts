// packages/core/src/db/migrate.ts
// Applies numbered SQL migration files in order on startup.
// Uses native node:sqlite via packages/core/src/db/database.ts

import { mkdirSync, readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Database } from './database.js';

export { Database } from './database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getMigrationsDir(): string {
  const candidates = [
    join(__dirname, '../migrations'),
    join(__dirname, '../../src/migrations'),
    join(process.cwd(), 'packages/core/src/migrations'),
    join(process.cwd(), '../../packages/core/src/migrations'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return join(__dirname, '../migrations');
}

const MIGRATIONS_DIR = getMigrationsDir();

export function migrate(db: Database): void {
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

export function openDb(dataDir: string): Database {
  mkdirSync(dataDir, { recursive: true });
  const dbPath = join(dataDir, 'app.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}
