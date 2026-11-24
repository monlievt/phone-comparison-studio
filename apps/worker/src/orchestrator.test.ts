// apps/worker/src/orchestrator.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  Database,
  migrate,
  JobQueue,
  saveStudioSettings,
  loadSocTiers,
} from '@phone-studio/core';
import { PipelineOrchestrator, parseCategoryMetric } from './orchestrator.js';
import { AutopilotController } from './autopilot.js';
import { WorkerRunner } from './runner.js';

function createMigratedDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

describe('parseCategoryMetric (VERDICT_RULES.md)', () => {
  const socTiers = loadSocTiers();

  it('uses SoC tier lookup instead of raw digit extraction', () => {
    const a19Pro = parseCategoryMetric('chipset', 'Apple A19 Pro', socTiers);
    const a18Pro = parseCategoryMetric('chipset', 'Apple A18 Pro', socTiers);
    const snap8Gen3 = parseCategoryMetric('chipset', 'Qualcomm Snapdragon 8 Gen 3', socTiers);
    const helioG99 = parseCategoryMetric('chipset', 'MediaTek Helio G99', socTiers);
    const unisocT606 = parseCategoryMetric('chipset', 'Unisoc T606', socTiers);

    expect(a19Pro).toBe(100);
    expect(a18Pro).toBe(96);
    expect(snap8Gen3).toBe(89);
    expect(helioG99).toBe(42);
    expect(unisocT606).toBe(30);
    expect(a19Pro!).toBeGreaterThan(a18Pro!);
    expect(a18Pro!).toBeGreaterThan(snap8Gen3!);
    expect(snap8Gen3!).toBeGreaterThan(helioG99!);
    expect(helioG99!).toBeGreaterThan(unisocT606!);
  });

  it('parses resolution as total pixels (W * H)', () => {
    expect(parseCategoryMetric('resolution', '2400 x 1080 px', socTiers)).toBe(2_592_000);
    expect(parseCategoryMetric('resolution', '3200 × 1440', socTiers)).toBe(4_608_000);
  });

  it('parses display_type and video_recording ordinals accurately', () => {
    expect(parseCategoryMetric('display_type', 'LTPO AMOLED', socTiers)!).toBeGreaterThan(
      parseCategoryMetric('display_type', 'AMOLED', socTiers)!
    );
    expect(parseCategoryMetric('display_type', 'AMOLED', socTiers)).toBe(
      parseCategoryMetric('display_type', 'OLED', socTiers)
    );
    expect(parseCategoryMetric('video_recording', '8K@24fps', socTiers)!).toBeGreaterThan(
      parseCategoryMetric('video_recording', '4K@30/60fps', socTiers)!
    );
  });

  it('parses IP rating and returns null on missing values', () => {
    expect(parseCategoryMetric('ip_rating', 'IP68', socTiers)!).toBeGreaterThan(
      parseCategoryMetric('ip_rating', 'IPX8', socTiers)!
    );
    expect(parseCategoryMetric('price', null, socTiers)).toBeNull();
    expect(parseCategoryMetric('chipset', 'Unknown Future Chip', socTiers)).toBeNull();
  });
});

describe('PipelineOrchestrator', () => {
  let db: Database.Database;
  let queue: JobQueue;
  let orchestrator: PipelineOrchestrator;
  let tempDataDir: string;

  beforeEach(() => {
    db = createMigratedDb();
    queue = new JobQueue(db);
    tempDataDir = mkdtempSync(join(tmpdir(), 'phone-studio-test-'));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Test double for LlmRouter
    const mockRouter: any = {
      callJson: vi.fn(),
    };

    orchestrator = new PipelineOrchestrator({
      db,
      queue,
      router: mockRouter,
      dataDir: tempDataDir,
      minCategories: 2,
    });
  });

  it('handles track_candidates and completes job', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const jobId = queue.enqueue('track_candidates');
    const job = queue.claim(['track_candidates'])!;

    await orchestrator.executeJob(job);

    const updated = db.prepare('SELECT state FROM jobs WHERE id = ?').get(jobId) as { state: string };
    expect(updated.state).toBe('done');
    vi.unstubAllGlobals();
    rmSync(tempDataDir, { recursive: true, force: true });
  });

  it('computes deterministic verdict, skips null categories, forwards shape_json, and enqueues generate_copy', async () => {
    const cmpId = 'cmp_test_01';
    const shape1 = { bodyMM: { h: 162, w: 76, d: 8.2 }, screenInch: 6.7, aspect: 2.17, frontCamera: 'punch_center', edge: 'flat', frame: 'flat', rearLenses: 3, evidence: {} };

    db.prepare(`
      INSERT INTO comparisons (id, title, phone_ids_json, formats_json, theme_version, status, created_at, updated_at)
      VALUES (?, 'Samsung Galaxy S25 vs Xiaomi 15', ?, '["long"]', 'v3', 'DATA_APPROVED', '2026-11-22', '2026-11-22')
    `).run(cmpId, JSON.stringify([{ brand: 'Samsung', model: 'Galaxy S25' }, { brand: 'Xiaomi', model: '15' }]));

    db.prepare(`
      INSERT INTO phones (id, brand, model, price_usd, accent, shape_json, created_at)
      VALUES ('p1', 'Samsung', 'Galaxy S25', 799, '#1428A0', ?, '2026-11-22'),
             ('p2', 'Xiaomi', '15', 749, '#FF6700', NULL, '2026-11-22')
    `).run(JSON.stringify(shape1));

    // Insert battery (complete) and weight (one phone null -> must be skipped, NOT ranked 0 as winner!)
    db.prepare(`
      INSERT INTO spec_values (id, phone_id, category_key, raw_value, confidence, conflict)
      VALUES ('s1', 'p1', 'battery', '4,000 mAh', 0.9, 0),
             ('s2', 'p2', 'battery', '5,400 mAh', 0.9, 0),
             ('s3', 'p1', 'weight', '162 g', 0.9, 0),
             ('s4', 'p2', 'weight', NULL, 0.0, 0),
             ('s5', 'p1', 'chipset', 'Snapdragon 8 Elite', 0.9, 0),
             ('s6', 'p2', 'chipset', 'Snapdragon 8 Gen 3', 0.9, 0)
    `).run();

    const jobId = queue.enqueue('compute_verdict', { comparisonId: cmpId });
    const job = queue.claim(['compute_verdict'])!;

    await orchestrator.executeJob(job);

    const updated = db.prepare('SELECT state FROM jobs WHERE id = ?').get(jobId) as { state: string };
    expect(updated.state).toBe('done');

    const cmp = db.prepare('SELECT final_json, status FROM comparisons WHERE id = ?').get(cmpId) as {
      final_json: string;
      status: string;
    };
    expect(cmp.status).toBe('DATA_APPROVED');

    const finalJson = JSON.parse(cmp.final_json);
    expect(finalJson.overall).toBeDefined();
    expect(finalJson.phones[0].shape).toEqual(shape1);

    // Weight had null -> skipped; battery & chipset included
    const keys = finalJson.categories.map((c: { key: string }) => c.key);
    expect(keys).toContain('battery');
    expect(keys).toContain('chipset');
    expect(keys).not.toContain('weight');

    // Snapdragon 8 Elite (94) beats Snapdragon 8 Gen 3 (90)
    const chipCat = finalJson.categories.find((c: { key: string }) => c.key === 'chipset');
    expect(chipCat.ranking).toEqual([1, 2]);

    const nextJob = db
      .prepare('SELECT type, state FROM jobs WHERE comparison_id = ? AND type = ?')
      .get(cmpId, 'generate_copy') as { state: string };
    expect(nextJob.state).toBe('queued');

    rmSync(tempDataDir, { recursive: true, force: true });
  });

  it('blocks compute_verdict when fewer than minCategories pass confidence threshold', async () => {
    const strictOrch = new PipelineOrchestrator({
      db,
      queue,
      router: { callJson: vi.fn() } as unknown as ConstructorParameters<typeof PipelineOrchestrator>[0]['router'],
      dataDir: tempDataDir,
      minCategories: 6,
    });
    const cmpId = 'cmp_low_conf';
    db.prepare(`
      INSERT INTO comparisons (id, title, phone_ids_json, formats_json, theme_version, status, created_at, updated_at)
      VALUES (?, 'Phone A vs Phone B', ?, '["long"]', 'v3', 'COLLECTED', '2026-11-24', '2026-11-24')
    `).run(cmpId, JSON.stringify([{ brand: 'BrandA', model: 'One' }, { brand: 'BrandB', model: 'Two' }]));

    db.prepare(`
      INSERT INTO phones (id, brand, model, price_usd, created_at)
      VALUES ('pa', 'BrandA', 'One', 200, '2026-11-24'),
             ('pb', 'BrandB', 'Two', 210, '2026-11-24')
    `).run();

    // Only 1 category >= 0.4; battery is 0.36 -> must block instead of rendering a 1-category video
    db.prepare(`
      INSERT INTO spec_values (id, phone_id, category_key, raw_value, confidence, conflict)
      VALUES ('x1', 'pa', 'display_type', 'IPS LCD', 0.9, 0),
             ('x2', 'pb', 'display_type', 'AMOLED', 0.9, 0),
             ('x3', 'pa', 'battery', '5000 mAh', 0.36, 0),
             ('x4', 'pb', 'battery', '5000 mAh', 0.36, 0)
    `).run();

    const jobId = queue.enqueue('compute_verdict', { comparisonId: cmpId });
    const job = queue.claim(['compute_verdict'])!;
    await strictOrch.executeJob(job);

    const updated = db.prepare('SELECT state, error FROM jobs WHERE id = ?').get(jobId) as { state: string; error: string };
    expect(updated.state).toBe('blocked');
    expect(updated.error).toContain('only 1 valid categories');

    const copyJob = db.prepare("SELECT id FROM jobs WHERE comparison_id = ? AND type = 'generate_copy'").get(cmpId);
    expect(copyJob).toBeUndefined();
    rmSync(tempDataDir, { recursive: true, force: true });
  });
});

describe('WorkerRunner render concurrency lock', () => {
  it('enforces max 1 concurrent render job while allowing general jobs', async () => {
    const db = createMigratedDb();
    const queue = new JobQueue(db);

    let resolveFirstRender!: () => void;
    const firstRenderStarted = new Promise<void>((res) => {
      resolveFirstRender = res;
    });
    let releaseRender!: () => void;
    const renderGate = new Promise<void>((res) => {
      releaseRender = res;
    });

    const executedTypes: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mock orchestrator
    const mockOrch: any = {
      executeJob: vi.fn(async (job: { id: string; type: string }) => {
        executedTypes.push(job.type);
        if (job.type === 'render_preview') {
          resolveFirstRender();
          await renderGate;
        }
        queue.complete(job.id);
      }),
    };

    const runner = new WorkerRunner({
      queue,
      orchestrator: mockOrch,
      maxGeneralConcurrency: 2,
      maxRenderConcurrency: 1,
    });

    queue.enqueue('render_preview', { comparisonId: 'c1', payload: { format: 'long' } });
    queue.enqueue('render_preview', { comparisonId: 'c1', payload: { format: 'short' } });
    queue.enqueue('find_topics');

    await runner.tick();
    await firstRenderStarted;

    // 1 render active, 2nd render MUST remain queued (render lock = 1)
    expect(runner.getActiveCounts().render).toBe(1);
    const queuedRenders = db
      .prepare("SELECT count(*) as c FROM jobs WHERE type = 'render_preview' AND state = 'queued'")
      .get() as { c: number };
    expect(queuedRenders.c).toBe(1);

    releaseRender();
    await new Promise((r) => setTimeout(r, 20));
    expect(runner.getActiveCounts().render).toBe(0);
  });
});

describe('AutopilotController (AUTOPILOT.md)', () => {
  let db: Database.Database;
  let queue: JobQueue;
  let tempDataDir: string;
  let autopilot: AutopilotController;

  beforeEach(() => {
    db = createMigratedDb();
    queue = new JobQueue(db);
    tempDataDir = mkdtempSync(join(tmpdir(), 'phone-studio-ap-'));
    autopilot = new AutopilotController(db, queue, tempDataDir);
    saveStudioSettings(db, {
      autopilot: {
        enabled: true,
        mode: 'autopilot',
        minCategories: 4,
        requiredCategories: ['price', 'battery'],
        minConfidence: 0.8,
        maxConsecutiveFailures: 2,
      },
    });
  });

  it('pauses scheduler when data/PAUSE kill switch file exists', async () => {
    writeFileSync(join(tempDataDir, 'PAUSE'), 'paused', 'utf-8');
    const res = await autopilot.runSchedulerTick();
    expect(res.action).toBe('paused');
    rmSync(tempDataDir, { recursive: true, force: true });
  });

  it('Data Judge marks SKIPPED_LOW_DATA when required categories fail confidence and trips brake after 2 failures', () => {
    for (const idx of [1, 2]) {
      const cmpId = `cmp_low_${idx}`;
      db.prepare(`
        INSERT INTO comparisons (id, title, phone_ids_json, formats_json, status, created_at, updated_at)
        VALUES (?, 'A vs B', ?, '["long"]', 'COLLECTED', '2026-11-22', '2026-11-22')
      `).run(cmpId, JSON.stringify([{ brand: 'BrandA', model: `M${idx}` }, { brand: 'BrandB', model: `N${idx}` }]));

      db.prepare(`
        INSERT INTO phones (id, brand, model, created_at)
        VALUES (?, 'BrandA', ?, '2026-11-22'), (?, 'BrandB', ?, '2026-11-22')
      `).run(`pa_${idx}`, `M${idx}`, `pb_${idx}`, `N${idx}`);

      const res = autopilot.evaluateDataJudge(cmpId);
      expect(res.passed).toBe(false);

      const row = db.prepare('SELECT status FROM comparisons WHERE id = ?').get(cmpId) as { status: string };
      expect(row.status).toBe('SKIPPED_LOW_DATA');
    }

    // After 2 consecutive failures, safety brake MUST pause autopilot
    expect(autopilot.isPaused().paused).toBe(true);
    rmSync(tempDataDir, { recursive: true, force: true });
  });

  it('Video Judge catches fabricated copy numbers and marks FAILED_QA', () => {
    const cmpId = 'cmp_qa_01';
    const previewFile = join(tempDataDir, 'preview-long.mp4');
    writeFileSync(previewFile, 'fake-mp4-bytes');

    const finalJson = {
      id: cmpId,
      phones: [
        { id: 'p1', name: 'Phone A', accent: '#111111', priceUSD: 500 },
        { id: 'p2', name: 'Phone B', accent: '#222222', priceUSD: 550 },
      ],
      categories: [
        {
          key: 'battery',
          label: 'Battery',
          values: [{ primary: '5,000 mAh' }, { primary: '4,500 mAh' }],
          ranking: [1, 2],
        },
      ],
      market: 'global',
      currency: 'USD',
      credits: ['Test'],
    };

    db.prepare(`
      INSERT INTO comparisons (id, title, phone_ids_json, formats_json, status, final_json, created_at, updated_at)
      VALUES (?, 'Phone A vs Phone B', '[]', '["long"]', 'PREVIEW_RENDERED', ?, '2026-11-22', '2026-11-22')
    `).run(cmpId, JSON.stringify(finalJson));

    // Fabricated 9999 mAh in hook -> must fail Video Judge!
    db.prepare(`
      INSERT INTO copy_assets (id, comparison_id, kind, payload_json, created_at)
      VALUES ('ca1', ?, 'all', ?, '2026-11-22')
    `).run(
      cmpId,
      JSON.stringify({
        titles: ['Phone A vs Phone B'],
        shortTitles: ['Phone A vs Phone B #Shorts'],
        hook: '9999 mAh battery monster!',
        description: 'Comparison between Phone A and Phone B.',
        tags: ['phone a', 'phone b', 'comparison'],
        hashtags: ['#tech'],
      })
    );

    db.prepare(`
      INSERT INTO renders (id, comparison_id, format, stage, file_path, status, created_at)
      VALUES ('r1', ?, 'long', 'preview', ?, 'ok', '2026-11-22')
    `).run(cmpId, previewFile);

    const res = autopilot.evaluateVideoJudge(cmpId);
    expect(res.passed).toBe(false);
    expect(res.reasons.some((r) => r.includes('9999'))).toBe(true);

    const row = db.prepare('SELECT status FROM comparisons WHERE id = ?').get(cmpId) as { status: string };
    expect(row.status).toBe('FAILED_QA');

    rmSync(tempDataDir, { recursive: true, force: true });
  });

  it('handleFindTopics auto-runs RSS + Gemini discovery when priced pool is empty and triggers autopilot_tick', async () => {
    const fakeTracker = {
      runDiscovery: vi.fn().mockImplementation(async () => {
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO phone_candidates (id, brand, model, source, status, estimated_price_usd, announced_date, created_at, updated_at)
          VALUES
            ('cand_1', 'Samsung', 'Galaxy S25', 'gemini_search', 'released', 799, '2026-01-20', ?, ?),
            ('cand_2', 'OnePlus', '13R', 'gemini_search', 'released', 749, '2026-01-15', ?, ?)
        `).run(now, now, now, now);
        return {
          gsmarenaFound: 0,
          nanoreviewFound: 0,
          totalFound: 2,
          geminiFound: 2,
          inserted: 2,
          updated: 0,
          feeds: [],
        };
      }),
    };

    const orchestrator = new PipelineOrchestrator({
      db,
      queue,
      router: {} as never,
      tracker: fakeTracker as never,
      autopilot,
    });

    const jobId = queue.enqueue('find_topics');
    const claimed = queue.claim(['find_topics']);
    expect(claimed?.id).toBe(jobId);

    await orchestrator.executeJob(claimed!);

    expect(fakeTracker.runDiscovery).toHaveBeenCalledWith(
      expect.objectContaining({ includeRss: true, includeGemini: true })
    );

    const topics = db.prepare("SELECT * FROM topics WHERE status = 'proposed'").all();
    expect(topics.length).toBe(1);

    const tickJob = db
      .prepare("SELECT id, state FROM jobs WHERE type = 'autopilot_tick' AND state = 'queued'")
      .get() as { id: string; state: string } | undefined;
    expect(tickJob).toBeDefined();

    rmSync(tempDataDir, { recursive: true, force: true });
  });

  it('handleAutopilotTick executes AutopilotController.runSchedulerTick on demand', async () => {
    const orchestrator = new PipelineOrchestrator({
      db,
      queue,
      router: {} as never,
      autopilot,
    });

    const jobId = queue.enqueue('autopilot_tick');
    const claimed = queue.claim(['autopilot_tick']);
    expect(claimed?.id).toBe(jobId);

    await orchestrator.executeJob(claimed!);

    const doneJob = db.prepare('SELECT state, result_json FROM jobs WHERE id = ?').get(jobId) as {
      state: string;
      result_json: string;
    };
    expect(doneJob.state).toBe('done');
    const result = JSON.parse(doneJob.result_json);
    expect(result.action).toBe('enqueued_find_topics');

    rmSync(tempDataDir, { recursive: true, force: true });
  });
});
