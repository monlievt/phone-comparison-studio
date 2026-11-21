// apps/worker/src/runner.ts
// Background Worker Runner loop: polls SQLite queue, maintains heartbeats, executes orchestrator.
// Specification: docs/PIPELINE_AND_JOBS.md §2

import { JobQueue, JobType, Job, HEARTBEAT_SECONDS } from '@phone-studio/core';
import { PipelineOrchestrator } from './orchestrator.js';

export interface WorkerRunnerOptions {
  queue: JobQueue;
  orchestrator: PipelineOrchestrator;
  pollIntervalMs?: number;
  supportedJobTypes?: JobType[];
}

export class WorkerRunner {
  private queue: JobQueue;
  private orchestrator: PipelineOrchestrator;
  private pollIntervalMs: number;
  private supportedJobTypes: JobType[];
  private isRunning = false;
  private activeJobsCount = 0;
  private maxConcurrency = 2; // general concurrency

  constructor(opts: WorkerRunnerOptions) {
    this.queue = opts.queue;
    this.orchestrator = opts.orchestrator;
    this.pollIntervalMs = opts.pollIntervalMs ?? 2000;
    this.supportedJobTypes = opts.supportedJobTypes ?? [
      'track_candidates',
      'find_topics',
      'collect_specs',
      'compute_verdict',
      'generate_copy',
      'handoff',
    ];
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[worker] Worker runner started. Polling queue every', this.pollIntervalMs, 'ms');
    this.pollLoop();
  }

  stop(): void {
    console.log('[worker] Stopping worker runner...');
    this.isRunning = false;
  }

  private async pollLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // 1. Requeue any jobs with expired leases
        this.queue.requeueExpired();

        // 2. Claim next available job if concurrency allows
        if (this.activeJobsCount < this.maxConcurrency) {
          const job = this.queue.claim(this.supportedJobTypes);
          if (job) {
            // Process in background without blocking poll loop
            this.processJob(job).catch((err) => {
              console.error(`[worker] Unexpected error processing job ${job.id}:`, err);
            });
          }
        }
      } catch (err) {
        console.error('[worker] Poll loop error:', err);
      }

      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
  }

  private async processJob(job: Job): Promise<void> {
    this.activeJobsCount++;
    console.log(`[worker] Claimed job ${job.id} (${job.type})`);

    // Setup heartbeat timer every 20s
    const heartbeatTimer = setInterval(() => {
      try {
        this.queue.heartbeat(job.id);
      } catch (err) {
        console.warn(`[worker] Failed heartbeat for job ${job.id}:`, err);
      }
    }, HEARTBEAT_SECONDS * 1000);

    try {
      await this.orchestrator.executeJob(job);
      console.log(`[worker] Successfully finished job ${job.id} (${job.type})`);
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      console.error(`[worker] Job ${job.id} failed:`, errMsg);
      this.queue.fail(job.id, errMsg);
    } finally {
      clearInterval(heartbeatTimer);
      this.activeJobsCount--;
    }
  }
}
