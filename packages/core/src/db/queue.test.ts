// packages/core/src/db/queue.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from './migrate.js';
import { JobQueue } from './queue.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

describe('JobQueue', () => {
  let db: Database.Database;
  let q: JobQueue;

  beforeEach(() => {
    db = makeDb();
    q = new JobQueue(db);
  });

  it('enqueues a job and returns an ID', () => {
    const id = q.enqueue('find_topics');
    expect(id).toHaveLength(26); // ULID
    const row = db.prepare('SELECT * FROM jobs WHERE id=?').get(id) as { state: string; type: string };
    expect(row.state).toBe('queued');
    expect(row.type).toBe('find_topics');
  });

  it('claim returns null when queue is empty', () => {
    expect(q.claim(['find_topics'])).toBeNull();
  });

  it('claim atomically leases the job', () => {
    q.enqueue('collect_specs', { comparisonId: 'cmp_01' });
    const job = q.claim(['collect_specs']);
    expect(job).not.toBeNull();
    expect(job!.state).toBe('running');
    expect(job!.comparison_id).toBe('cmp_01');
    // Second claim returns null (already claimed)
    expect(q.claim(['collect_specs'])).toBeNull();
  });

  it('complete marks job done', () => {
    q.enqueue('build_data');
    const job = q.claim(['build_data'])!;
    q.complete(job.id, { ok: true });
    const row = db.prepare('SELECT state, progress, result_json FROM jobs WHERE id=?').get(job.id) as {
      state: string;
      progress: number;
      result_json: string;
    };
    expect(row.state).toBe('done');
    expect(row.progress).toBe(100);
    expect(JSON.parse(row.result_json)).toEqual({ ok: true });
  });

  it('fail retries with backoff when attempts remain', () => {
    q.enqueue('generate_copy', { maxAttempts: 2 });
    const job = q.claim(['generate_copy'])!;
    q.fail(job.id, 'LLM timeout');
    const row = db.prepare('SELECT state, attempt, run_after FROM jobs WHERE id=?').get(job.id) as {
      state: string;
      attempt: number;
      run_after: string;
    };
    expect(row.state).toBe('queued'); // re-queued for retry
    expect(row.attempt).toBe(1);
    expect(row.run_after).toBeTruthy(); // backoff set
  });

  it('fail marks permanently failed after max_attempts', () => {
    q.enqueue('generate_copy', { maxAttempts: 1 });
    const job = q.claim(['generate_copy'])!;
    q.fail(job.id, 'persistent error');
    const row = db.prepare('SELECT state, attempt FROM jobs WHERE id=?').get(job.id) as {
      state: string;
      attempt: number;
    };
    expect(row.state).toBe('failed');
    expect(row.attempt).toBe(1);
  });

  it('block sets state to blocked', () => {
    q.enqueue('render_final');
    const job = q.claim(['render_final'])!;
    q.block(job.id, 'disk full');
    const row = db.prepare('SELECT state, error FROM jobs WHERE id=?').get(job.id) as {
      state: string;
      error: string;
    };
    expect(row.state).toBe('blocked');
    expect(row.error).toMatch(/disk full/);
  });

  it('requeueExpired re-queues jobs with expired leases', () => {
    q.enqueue('handoff');
    const job = q.claim(['handoff'])!;
    // Expire the lease manually
    db.prepare(`UPDATE jobs SET lease_until='2000-01-01T00:00:00Z' WHERE id=?`).run(job.id);
    const count = q.requeueExpired();
    expect(count).toBe(1);
    const row = db.prepare('SELECT state FROM jobs WHERE id=?').get(job.id) as { state: string };
    expect(row.state).toBe('queued');
  });

  it('progress updates the progress field', () => {
    q.enqueue('render_preview');
    const job = q.claim(['render_preview'])!;
    q.progress(job.id, 42);
    const row = db.prepare('SELECT progress FROM jobs WHERE id=?').get(job.id) as { progress: number };
    expect(row.progress).toBe(42);
  });

  it('getLogs returns job log entries', () => {
    q.enqueue('cleanup');
    const job = q.claim(['cleanup'])!;
    q.log(job.id, 'info', 'started cleanup');
    const logs = q.getLogs(job.id);
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs.at(-1)?.message).toContain('started cleanup');
  });
});
