// packages/core/src/db/queue.ts
// Job queue: lease, heartbeat, retry with exponential backoff.
// Pure SQLite — no Redis needed.
// See PIPELINE_AND_JOBS.md for rules.

import { Database } from './database.js';
import { ulid } from 'ulid';
import { JobState, JobType } from '../schemas/index.js';

export type { JobState, JobType };

export interface Job {
  id: string;
  comparison_id: string | null;
  type: JobType;
  state: JobState;
  attempt: number;
  max_attempts: number;
  payload_json: string | null;
  result_json: string | null;
  progress: number;
  error: string | null;
  lease_until: string | null;
  run_after: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnqueueOptions {
  comparisonId?: string;
  payload?: unknown;
  maxAttempts?: number;
  runAfter?: Date;
}

const LEASE_SECONDS = 60;
const HEARTBEAT_SECONDS = 20;
const RETRY_DELAYS_S = [30, 120]; // exponential backoff per retry

export class JobQueue {
  constructor(private db: Database.Database) {}

  enqueue(type: JobType, opts: EnqueueOptions = {}): string {
    const id = ulid();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO jobs (id, comparison_id, type, state, attempt, max_attempts, payload_json, progress, run_after, created_at, updated_at)
         VALUES (?, ?, ?, 'queued', 0, ?, ?, 0, ?, ?, ?)`
      )
      .run(
        id,
        opts.comparisonId ?? null,
        type,
        opts.maxAttempts ?? 2,
        opts.payload ? JSON.stringify(opts.payload) : null,
        opts.runAfter?.toISOString() ?? null,
        now,
        now
      );
    return id;
  }

  /**
   * Claim the next available job of the given types.
   * Uses an UPDATE with WHERE to atomically claim (no race condition with SQLite WAL).
   */
  claim(types: JobType[]): Job | null {
    const now = new Date().toISOString();
    const leaseUntil = new Date(Date.now() + LEASE_SECONDS * 1000).toISOString();
    const placeholders = types.map(() => '?').join(',');

    // Find candidate
    const candidate = this.db
      .prepare(
        `SELECT id FROM jobs
         WHERE type IN (${placeholders})
           AND state = 'queued'
           AND (run_after IS NULL OR run_after <= ?)
         ORDER BY created_at ASC
         LIMIT 1`
      )
      .get(...types, now) as { id: string } | undefined;

    if (!candidate) return null;

    // Atomically claim
    const result = this.db
      .prepare(
        `UPDATE jobs SET state='running', lease_until=?, updated_at=?
         WHERE id=? AND state='queued'`
      )
      .run(leaseUntil, now, candidate.id);

    if (result.changes === 0) return null; // lost the race

    return this.db.prepare('SELECT * FROM jobs WHERE id=?').get(candidate.id) as unknown as Job;
  }

  heartbeat(jobId: string): void {
    const leaseUntil = new Date(Date.now() + LEASE_SECONDS * 1000).toISOString();
    this.db
      .prepare(`UPDATE jobs SET lease_until=?, updated_at=? WHERE id=?`)
      .run(leaseUntil, new Date().toISOString(), jobId);
  }

  progress(jobId: string, pct: number): void {
    this.db
      .prepare(`UPDATE jobs SET progress=?, updated_at=? WHERE id=?`)
      .run(Math.min(100, Math.max(0, pct)), new Date().toISOString(), jobId);
  }

  complete(jobId: string, result?: unknown): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE jobs SET state='done', progress=100, result_json=?, lease_until=NULL, error=NULL, updated_at=? WHERE id=?`
      )
      .run(result ? JSON.stringify(result) : null, now, jobId);
    this.log(jobId, 'info', 'Job completed');
  }

  fail(jobId: string, error: string): void {
    const now = new Date().toISOString();
    const job = this.db.prepare('SELECT attempt, max_attempts FROM jobs WHERE id=?').get(jobId) as
      | Pick<Job, 'attempt' | 'max_attempts'>
      | undefined;

    if (!job) return;

    const nextAttempt = job.attempt + 1;
    if (nextAttempt < job.max_attempts) {
      // Retry with exponential backoff
      const delaySec = RETRY_DELAYS_S[Math.min(job.attempt, RETRY_DELAYS_S.length - 1)];
      const runAfter = new Date(Date.now() + delaySec * 1000).toISOString();
      this.db
        .prepare(
          `UPDATE jobs SET state='queued', attempt=?, error=?, lease_until=NULL, run_after=?, updated_at=? WHERE id=?`
        )
        .run(nextAttempt, error, runAfter, now, jobId);
      this.log(jobId, 'warn', `Job failed (attempt ${nextAttempt}/${job.max_attempts}), retry in ${delaySec}s: ${error}`);
    } else {
      this.db
        .prepare(
          `UPDATE jobs SET state='failed', attempt=?, error=?, lease_until=NULL, updated_at=? WHERE id=?`
        )
        .run(nextAttempt, error, now, jobId);
      this.log(jobId, 'error', `Job permanently failed after ${nextAttempt} attempts: ${error}`);
    }
  }

  block(jobId: string, reason: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE jobs SET state='blocked', error=?, lease_until=NULL, updated_at=? WHERE id=?`)
      .run(reason, now, jobId);
    this.log(jobId, 'warn', `Job blocked: ${reason}`);
  }

  /**
   * Requeue expired leases (lease_until < now AND state='running').
   * Call from the worker poll loop.
   */
  requeueExpired(): number {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `UPDATE jobs SET state='queued', lease_until=NULL, updated_at=?
         WHERE state='running' AND lease_until < ?`
      )
      .run(now, now);
    return Number(result.changes);
  }

  log(jobId: string, level: 'info' | 'warn' | 'error', message: string): void {
    this.db
      .prepare(`INSERT INTO job_logs(job_id, at, level, message) VALUES (?, ?, ?, ?)`)
      .run(jobId, new Date().toISOString(), level, message);
  }

  getLogs(jobId: string): Array<{ at: string; level: string; message: string }> {
    return this.db
      .prepare(`SELECT at, level, message FROM job_logs WHERE job_id=? ORDER BY id ASC`)
      .all(jobId) as Array<{ at: string; level: string; message: string }>;
  }
}

export { HEARTBEAT_SECONDS };
