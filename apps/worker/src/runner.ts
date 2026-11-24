// apps/worker/src/runner.ts
// Background Worker Runner loop: polls SQLite queue, maintains heartbeats, enforces render lock (concurrency=1).
// Specification: docs/PIPELINE_AND_JOBS.md §2

import { JobQueue, JobType, Job, HEARTBEAT_SECONDS } from '@phone-studio/core';
import { PipelineOrchestrator } from './orchestrator.js';

export const RENDER_JOB_TYPES: JobType[] = ['render_preview', 'render_final', 'render_thumbnail'];
export const GENERAL_JOB_TYPES: JobType[] = [
  'autopilot_tick',
  'track_candidates',
  'find_topics',
  'collect_specs',
  'collect_benchmarks',
  'collect_images',
  'resolve_images',
  'compute_verdict',
  'generate_copy',
  'build_metadata',
  'handoff',
  'cleanup',
];

export interface WorkerRunnerOptions {
  queue: JobQueue;
  orchestrator: PipelineOrchestrator;
  pollIntervalMs?: number;
  supportedJobTypes?: JobType[];
  maxGeneralConcurrency?: number;
  maxRenderConcurrency?: number;
}

export class WorkerRunner {
  private queue: JobQueue;
  private orchestrator: PipelineOrchestrator;
  private pollIntervalMs: number;
  private generalJobTypes: JobType[];
  private renderJobTypes: JobType[];
  private isRunning = false;
  private activeGeneralJobs = 0;
  private activeRenderJobs = 0;
  private maxGeneralConcurrency: number;
  private maxRenderConcurrency: number;

  constructor(opts: WorkerRunnerOptions) {
    this.queue = opts.queue;
    this.orchestrator = opts.orchestrator;
    this.pollIntervalMs = opts.pollIntervalMs ?? 2000;
    this.maxGeneralConcurrency = opts.maxGeneralConcurrency ?? 2;
    this.maxRenderConcurrency = opts.maxRenderConcurrency ?? 1; // Strict render lock per ARCHITECTURE.md §1

    if (opts.supportedJobTypes) {
      const renderSet = new Set<JobType>(RENDER_JOB_TYPES);
      this.renderJobTypes = opts.supportedJobTypes.filter((t) => renderSet.has(t));
      this.generalJobTypes = opts.supportedJobTypes.filter((t) => !renderSet.has(t));
    } else {
      this.renderJobTypes = [...RENDER_JOB_TYPES];
      this.generalJobTypes = [...GENERAL_JOB_TYPES];
    }
  }

  getActiveCounts(): { general: number; render: number } {
    return { general: this.activeGeneralJobs, render: this.activeRenderJobs };
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(
      `[worker] Worker runner started. Polling every ${this.pollIntervalMs}ms (general=${this.maxGeneralConcurrency}, renderLock=${this.maxRenderConcurrency})`
    );
    this.pollLoop();
  }

  stop(): void {
    console.log('[worker] Stopping worker runner...');
    this.isRunning = false;
  }

  /**
   * Executes one poll tick (exported for deterministic unit testing).
   */
  async tick(): Promise<void> {
    // 1. Requeue any jobs with expired leases
    this.queue.requeueExpired();

    // 2. Claim render job strictly under render lock (concurrency = 1)
    if (this.renderJobTypes.length > 0 && this.activeRenderJobs < this.maxRenderConcurrency) {
      const renderJob = this.queue.claim(this.renderJobTypes);
      if (renderJob) {
        this.processJob(renderJob, true).catch((err) => {
          console.error(`[worker] Unexpected error processing render job ${renderJob.id}:`, err);
        });
      }
    }

    // 3. Claim general job up to general concurrency (default = 2)
    while (this.generalJobTypes.length > 0 && this.activeGeneralJobs < this.maxGeneralConcurrency) {
      const generalJob = this.queue.claim(this.generalJobTypes);
      if (!generalJob) break;
      this.processJob(generalJob, false).catch((err) => {
        console.error(`[worker] Unexpected error processing general job ${generalJob.id}:`, err);
      });
    }
  }

  private async pollLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.tick();
      } catch (err) {
        console.error('[worker] Poll loop error:', err);
      }

      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
  }

  private async processJob(job: Job, isRender: boolean): Promise<void> {
    if (isRender) {
      this.activeRenderJobs++;
    } else {
      this.activeGeneralJobs++;
    }
    console.log(`[worker] Claimed ${isRender ? 'render' : 'general'} job ${job.id} (${job.type})`);

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
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[worker] Job ${job.id} failed:`, errMsg);
      this.queue.fail(job.id, errMsg);
    } finally {
      clearInterval(heartbeatTimer);
      if (isRender) {
        this.activeRenderJobs--;
      } else {
        this.activeGeneralJobs--;
      }
    }
  }
}
