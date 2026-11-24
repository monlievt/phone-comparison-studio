// packages/core/src/db/database.ts
// Native SQLite driver wrapper using Node 22+ built-in node:sqlite (DatabaseSync)
// Provides 100% compatible synchronous API with zero native C++ compilation dependencies.

import { createRequire } from 'module';
import type { DatabaseSync as DatabaseSyncType, StatementSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

export class Database {
  private sync: DatabaseSyncType;

  constructor(location: string, options?: { open?: boolean }) {
    this.sync = options ? new DatabaseSync(location, options) : new DatabaseSync(location);
  }

  exec(sql: string): void {
    this.sync.exec(sql);
  }

  pragma(pragmaStr: string): void {
    this.sync.exec(`PRAGMA ${pragmaStr};`);
  }

  prepare(sql: string): StatementSync {
    return this.sync.prepare(sql);
  }

  close(): void {
    this.sync.close();
  }
}

export namespace Database {
  export type Database = InstanceType<typeof Database>;
}

export default Database;
