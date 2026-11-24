// packages/collectors/src/benchmarks/csv-importer.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '@phone-studio/core';
import { parseBenchmarkCsv, importBenchmarkCsv } from './csv-importer.js';

describe('parseBenchmarkCsv', () => {
  it('parses benchmark CSV with parts', () => {
    const csv = `
      device,variant,main,cpu,gpu,mem,ux
      Samsung Galaxy S25,8/256,"2,150,000",500000,850000,450000,350000
      Xiaomi 15,12/256,2200000,510000,880000,460000,350000
    `;
    const res = parseBenchmarkCsv(csv);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0].device).toBe('Samsung Galaxy S25');
    expect(res.rows[0].main).toBe(2150000);
    expect(res.rows[0].parts.cpu).toBe(500000);
  });
});

describe('importBenchmarkCsv', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE IF NOT EXISTS phones (
        id TEXT PRIMARY KEY,
        brand TEXT NOT NULL,
        model TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS benchmark_snapshots (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        version TEXT NOT NULL,
        period TEXT NOT NULL,
        source_url TEXT,
        taken_at TEXT,
        method TEXT,
        permission_note TEXT
      );

      CREATE TABLE IF NOT EXISTS benchmark_scores (
        id TEXT PRIMARY KEY,
        snapshot_id TEXT NOT NULL REFERENCES benchmark_snapshots(id),
        phone_id TEXT NOT NULL REFERENCES phones(id),
        variant_used TEXT,
        main REAL NOT NULL,
        parts_json TEXT NOT NULL,
        UNIQUE(snapshot_id, phone_id)
      );
    `);

    // Seed phone
    db.prepare("INSERT INTO phones (id, brand, model) VALUES ('p1', 'Samsung', 'Galaxy S25')").run();
  });

  it('imports CSV and matches known phone without FK violation on unknown devices', () => {
    const csv = `
      device,main,cpu,gpu
      Samsung Galaxy S25,2150000,500000,850000
      Unknown Phone X,1200000,300000,400000
    `;

    const result = importBenchmarkCsv(db, 'AnTuTu', 'v10', '2026-10', csv);
    expect(result.rowCount).toBe(2);
    expect(result.matchedCount).toBe(1);
    expect(result.unmatchedDevices).toEqual(['Unknown Phone X']);

    const snapshot = db.prepare('SELECT source, version FROM benchmark_snapshots WHERE id = ?').get(result.snapshotId) as {
      source: string;
      version: string;
    };
    expect(snapshot.source).toBe('AnTuTu');

    const scores = db.prepare('SELECT main FROM benchmark_scores WHERE snapshot_id = ?').all(result.snapshotId);
    expect(scores).toHaveLength(1);
  });
});
