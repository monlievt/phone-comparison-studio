// packages/collectors/src/images/image-resolver.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { tmpdir } from 'os';
import { join } from 'path';
import { ImageResolver } from './image-resolver.js';

describe('ImageResolver', () => {
  let db: Database.Database;
  const tmpAssets = join(tmpdir(), `assets-test-${Date.now()}`);

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        phone_id TEXT NOT NULL,
        kind TEXT,
        file_path TEXT,
        sha256 TEXT,
        license TEXT,
        author TEXT,
        source_url TEXT,
        accessed_at TEXT,
        terms_url TEXT,
        allows_modification INTEGER,
        status TEXT
      );
    `);
  });

  it('blocks unverified brand image and falls back to parametric phone', async () => {
    const resolver = new ImageResolver(db, tmpAssets, [
      { brand: 'Apple', termsUrl: 'https://apple.com/legal', allowed: false },
      { brand: 'Samsung', termsUrl: 'https://samsung.com/legal', allowed: null }, // unverified
    ]);

    const res = await resolver.resolveImage('phone_1', 'Samsung', 'Galaxy S25', 'https://samsung.com/press/s25.png');

    expect(res.status).toBe('blocked');
    expect(res.useParametricPhone).toBe(true);

    const row = db.prepare('SELECT status, license FROM images WHERE phone_id = ?').get('phone_1') as any;
    expect(row.status).toBe('blocked');
  });

  it('handles missing image and falls back to parametric mockup', async () => {
    const resolver = new ImageResolver(db, tmpAssets);
    const res = await resolver.resolveImage('phone_2', 'Google', 'Pixel 9');

    expect(res.status).toBe('missing');
    expect(res.useParametricPhone).toBe(true);
  });
});
