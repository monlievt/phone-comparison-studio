// apps/worker/src/orchestrator.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { JobQueue } from '@phone-studio/core';
import { PipelineOrchestrator } from './orchestrator.js';

describe('PipelineOrchestrator', () => {
  let db: Database.Database;
  let queue: JobQueue;
  let orchestrator: PipelineOrchestrator;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        comparison_id TEXT,
        type TEXT NOT NULL,
        state TEXT NOT NULL,
        attempt INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 2,
        payload_json TEXT,
        result_json TEXT,
        progress REAL DEFAULT 0,
        error TEXT,
        lease_until TEXT,
        run_after TEXT,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS job_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT,
        at TEXT,
        level TEXT,
        message TEXT
      );

      CREATE TABLE IF NOT EXISTS phone_candidates (
        id TEXT PRIMARY KEY,
        brand TEXT NOT NULL,
        model TEXT NOT NULL,
        variant TEXT,
        source TEXT NOT NULL,
        source_url TEXT,
        status TEXT NOT NULL DEFAULT 'announced',
        announced_date TEXT,
        release_date TEXT,
        estimated_price_usd REAL,
        soc_name TEXT,
        raw_payload_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(brand, model, variant)
      );

      CREATE TABLE IF NOT EXISTS topics (
        id TEXT PRIMARY KEY,
        phone_ids_json TEXT NOT NULL,
        score REAL,
        reasons_json TEXT,
        angle TEXT,
        status TEXT NOT NULL DEFAULT 'proposed',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS comparisons (
        id TEXT PRIMARY KEY,
        title TEXT,
        phone_ids_json TEXT NOT NULL,
        formats_json TEXT NOT NULL,
        status TEXT NOT NULL,
        final_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS copy_assets (
        id TEXT PRIMARY KEY,
        comparison_id TEXT NOT NULL,
        kind TEXT,
        payload_json TEXT NOT NULL,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS phones (
        id TEXT PRIMARY KEY,
        brand TEXT NOT NULL,
        model TEXT NOT NULL,
        price_usd REAL,
        accent TEXT,
        release_date TEXT
      );

      CREATE TABLE IF NOT EXISTS spec_values (
        id TEXT PRIMARY KEY,
        phone_id TEXT NOT NULL,
        category_key TEXT NOT NULL,
        raw_value TEXT
      );
    `);

    queue = new JobQueue(db);
    const mockRouter: any = {
      callJson: vi.fn(),
    };

    orchestrator = new PipelineOrchestrator({
      db,
      queue,
      router: mockRouter,
    });
  });

  it('handles track_candidates and completes job', async () => {
    const jobId = queue.enqueue('track_candidates');
    const job = queue.claim(['track_candidates'])!;

    await orchestrator.executeJob(job);

    const updated = db.prepare('SELECT state FROM jobs WHERE id = ?').get(jobId) as { state: string };
    expect(updated.state).toBe('done');
  });

  it('computes verdict and enqueues generate_copy', async () => {
    // Seed comparison & phones
    const cmpId = 'cmp_test_01';
    db.prepare(`
      INSERT INTO comparisons (id, phone_ids_json, formats_json, status, created_at, updated_at)
      VALUES (?, '["Samsung", "Xiaomi"]', '["long"]', 'DATA_APPROVED', 'now', 'now')
    `).run(cmpId);

    db.prepare(`
      INSERT INTO phones (id, brand, model, price_usd, accent)
      VALUES ('p1', 'Samsung', 'Galaxy S25', 799, '#1a1a1a'),
             ('p2', 'Xiaomi', '15', 749, '#2a2a2a')
    `).run();

    const jobId = queue.enqueue('compute_verdict', { comparisonId: cmpId });
    const job = queue.claim(['compute_verdict'])!;

    await orchestrator.executeJob(job);

    // Verify job is done
    const updated = db.prepare('SELECT state FROM jobs WHERE id = ?').get(jobId) as { state: string };
    expect(updated.state).toBe('done');

    // Verify final_json is populated
    const cmp = db.prepare('SELECT final_json, status FROM comparisons WHERE id = ?').get(cmpId) as any;
    expect(cmp.status).toBe('COPY_READY');
    expect(JSON.parse(cmp.final_json).overall).toBeDefined();

    // Verify next job (generate_copy) was queued
    const nextJob = db.prepare('SELECT type, state FROM jobs WHERE comparison_id = ? AND type = ?').get(cmpId, 'generate_copy') as any;
    expect(nextJob.state).toBe('queued');
  });
});
