// apps/web/src/lib/db.ts
import Database from 'better-sqlite3';
import { join } from 'path';
import { openDb } from '@phone-studio/core';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const rootDir = process.cwd().includes('apps/web')
    ? join(process.cwd(), '../..')
    : process.cwd();

  const dataDir = join(rootDir, 'data');
  _db = openDb(dataDir);
  return _db;
}
