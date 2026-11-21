// apps/worker/src/orchestrator.ts
// Pipeline Orchestrator: executes individual jobs from the queue and chains the pipeline stages.
// Specification: docs/PIPELINE_AND_JOBS.md

import Database from 'better-sqlite3';
import { ulid } from 'ulid';
import { Job, JobQueue, computeRanks, computeOverall, DEFAULT_CATEGORY_RULES, CATEGORY_LABELS } from '@phone-studio/core';
import { LlmRouter, buildCopyAllPrompt, CopyAllSchema, generateTemplateCopy } from '@phone-studio/ai';
import { CandidateTrackerService, proposePairs, SpecCollector, PhoneCandidateForPair } from '@phone-studio/collectors';
import { HttpPublisher, PublishRequest } from '@phone-studio/publisher';

export interface OrchestratorOptions {
  db: Database.Database;
  queue: JobQueue;
  router: LlmRouter;
  publisher?: HttpPublisher;
  specCollector?: SpecCollector;
}

export class PipelineOrchestrator {
  private db: Database.Database;
  private queue: JobQueue;
  private router: LlmRouter;
  private publisher?: HttpPublisher;
  private specCollector: SpecCollector;
  private tracker: CandidateTrackerService;

  constructor(opts: OrchestratorOptions) {
    this.db = opts.db;
    this.queue = opts.queue;
    this.router = opts.router;
    this.publisher = opts.publisher;
    this.specCollector = opts.specCollector ?? new SpecCollector(this.db, this.router);
    this.tracker = new CandidateTrackerService(this.db);
  }

  async executeJob(job: Job): Promise<void> {
    const payload = job.payload_json ? JSON.parse(job.payload_json) : {};

    switch (job.type) {
      case 'track_candidates':
        await this.handleTrackCandidates(job);
        break;

      case 'find_topics':
        await this.handleFindTopics(job);
        break;

      case 'collect_specs':
        await this.handleCollectSpecs(job, payload);
        break;

      case 'compute_verdict':
        await this.handleComputeVerdict(job, payload);
        break;

      case 'generate_copy':
        await this.handleGenerateCopy(job, payload);
        break;

      case 'handoff':
        await this.handleHandoff(job, payload);
        break;

      default:
        this.queue.complete(job.id, { skipped: true, reason: `No handler implemented for ${job.type}` });
        break;
    }
  }

  private async handleTrackCandidates(job: Job): Promise<void> {
    this.queue.log(job.id, 'info', 'Starting RSS & Nanoreview candidate phone discovery...');
    const summary = await this.tracker.runDiscovery();
    this.queue.complete(job.id, summary);
  }

  private async handleFindTopics(job: Job): Promise<void> {
    this.queue.log(job.id, 'info', 'Finding comparison candidates from candidate phones...');
    const candidates = this.tracker.getAvailableCandidates();

    // Map into format for pair finder
    const phoneCandidates: PhoneCandidateForPair[] = candidates.map((c, idx) => ({
      id: `cand_${idx}`,
      brand: c.brand,
      model: c.model,
      priceUSD: 699, // default if not yet collected
      hasSpecs: false,
    }));

    const topics = proposePairs(phoneCandidates, 60);

    for (const topic of topics) {
      const topicId = ulid();
      this.db
        .prepare(
          `INSERT OR IGNORE INTO topics (id, phone_ids_json, score, reasons_json, angle, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'proposed', ?)`
        )
        .run(
          topicId,
          JSON.stringify(topic.phoneNames),
          topic.score,
          JSON.stringify(topic.reasons),
          topic.angle,
          new Date().toISOString()
        );
    }

    this.queue.complete(job.id, { topicsFound: topics.length });
  }

  private async handleCollectSpecs(job: Job, payload: any): Promise<void> {
    const comparisonId = job.comparison_id ?? payload.comparisonId;
    if (!comparisonId) {
      throw new Error('comparison_id is required for collect_specs');
    }

    const cmp = this.db.prepare('SELECT phone_ids_json FROM comparisons WHERE id = ?').get(comparisonId) as
      | { phone_ids_json: string }
      | undefined;

    if (!cmp) {
      throw new Error(`Comparison not found: ${comparisonId}`);
    }

    const phones: Array<{ brand: string; model: string; specUrl?: string }> = JSON.parse(cmp.phone_ids_json);
    const results = [];

    for (let i = 0; i < phones.length; i++) {
      const p = phones[i];
      this.queue.log(job.id, 'info', `Collecting specs for ${p.brand} ${p.model}...`);
      const res = await this.specCollector.collect(p);
      results.push(res);
      this.queue.progress(job.id, Math.round(((i + 1) / phones.length) * 100));
    }

    // Advance comparison status to DATA_APPROVED and enqueue verdict computation
    this.db
      .prepare('UPDATE comparisons SET status = ?, updated_at = ? WHERE id = ?')
      .run('DATA_APPROVED', new Date().toISOString(), comparisonId);

    this.queue.complete(job.id, { collectedCount: results.length });

    // Next step in chain: compute verdict
    this.queue.enqueue('compute_verdict', { comparisonId });
  }

  private async handleComputeVerdict(job: Job, payload: any): Promise<void> {
    const comparisonId = job.comparison_id ?? payload.comparisonId;
    this.queue.log(job.id, 'info', `Computing deterministic verdict for comparison ${comparisonId}...`);

    // Fetch phones and spec values
    const phones = this.db
      .prepare(
        `SELECT p.id, p.brand, p.model, p.price_usd, p.accent, p.release_date
         FROM phones p
         JOIN comparisons c ON c.phone_ids_json LIKE '%' || p.brand || '%'
         WHERE c.id = ?
         LIMIT 3`
      )
      .all(comparisonId) as any[];

    if (phones.length < 2) {
      throw new Error('Need at least 2 phones to compute comparison verdict');
    }

    const categories: any[] = [];

    for (const [key, rule] of Object.entries(DEFAULT_CATEGORY_RULES)) {
      const rawValues = phones.map((p) => {
        const spec = this.db
          .prepare('SELECT raw_value FROM spec_values WHERE phone_id = ? AND category_key = ?')
          .get(p.id, key) as { raw_value: string } | undefined;
        return spec?.raw_value ?? null;
      });

      // Simple numeric parsing for ranking
      const numValues = rawValues.map((v) => {
        if (!v) return 0;
        const num = parseFloat(v.replace(/[^0-9.]/g, ''));
        return isNaN(num) ? 0 : num;
      });

      const ranking = computeRanks(numValues, rule.rule, rule.tieEps, rule.isPercentageEps);

      categories.push({
        key,
        label: CATEGORY_LABELS[key] ?? key,
        values: rawValues.map((v) => ({ primary: v ?? 'N/A' })),
        ranking,
        weight: rule.weight,
      });
    }

    const overall = computeOverall(categories, phones.length);

    const finalComparisonJson = {
      id: comparisonId,
      phones: phones.map((p) => ({
        id: p.id,
        name: `${p.brand} ${p.model}`,
        accent: p.accent ?? '#1a1a1a',
        priceUSD: p.price_usd ?? 499,
      })),
      categories,
      overall,
      market: 'global',
      currency: 'USD',
      credits: ['Manufacturer technical sheets', 'Phone Studio Engine'],
    };

    // Save final_json into comparisons table
    this.db
      .prepare('UPDATE comparisons SET final_json = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(finalComparisonJson), 'COPY_READY', new Date().toISOString(), comparisonId);

    this.queue.complete(job.id, { overallWinnerRank: overall.ranking });

    // Next step in chain: generate copy
    this.queue.enqueue('generate_copy', { comparisonId });
  }

  private async handleGenerateCopy(job: Job, payload: any): Promise<void> {
    const comparisonId = job.comparison_id ?? payload.comparisonId;
    this.queue.log(job.id, 'info', `Generating YouTube copy for comparison ${comparisonId}...`);

    const cmp = this.db
      .prepare('SELECT final_json FROM comparisons WHERE id = ?')
      .get(comparisonId) as { final_json: string } | undefined;

    if (!cmp?.final_json) {
      throw new Error(`Comparison final_json not found for ${comparisonId}`);
    }

    const data = JSON.parse(cmp.final_json);

    let copyData;
    try {
      const prompt = buildCopyAllPrompt({
        phones: data.phones,
        categories: data.categories.map((c: any) => ({
          key: c.key,
          label: c.label,
          winnerNames: c.ranking
            .map((r: number, idx: number) => (r === 1 ? data.phones[idx].name : null))
            .filter(Boolean),
          tie: c.ranking.filter((r: number) => r === 1).length > 1,
        })),
      });

      const res = await this.router.callJson({
        task: 'copy_all',
        promptId: prompt.promptId,
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        schema: CopyAllSchema,
        temperature: 0.6,
      });

      copyData = res.data;
    } catch (err) {
      this.queue.log(job.id, 'warn', `AI copy generation failed, using template copy fallback: ${err}`);
      copyData = generateTemplateCopy(data.phones);
    }

    // Save copy assets to DB
    const copyId = ulid();
    this.db
      .prepare(
        `INSERT INTO copy_assets (id, comparison_id, kind, payload_json, created_at)
         VALUES (?, ?, 'all', ?, ?)`
      )
      .run(copyId, comparisonId, JSON.stringify(copyData), new Date().toISOString());

    this.db
      .prepare('UPDATE comparisons SET status = ?, updated_at = ? WHERE id = ?')
      .run('VIDEO_APPROVED', new Date().toISOString(), comparisonId);

    this.queue.complete(job.id, { copyGenerated: true, titles: copyData.titles });
  }

  private async handleHandoff(job: Job, payload: any): Promise<void> {
    if (!this.publisher) {
      throw new Error('Publisher is not configured for handoff');
    }

    const comparisonId = job.comparison_id ?? payload.comparisonId;
    const render = this.db
      .prepare('SELECT file_path FROM renders WHERE comparison_id = ? AND format = ? AND stage = ?')
      .get(comparisonId, 'long', 'final') as { file_path: string } | undefined;

    const copy = this.db
      .prepare('SELECT payload_json FROM copy_assets WHERE comparison_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(comparisonId) as { payload_json: string } | undefined;

    if (!render?.file_path) {
      throw new Error(`Final render file not found for comparison ${comparisonId}`);
    }

    const copyPayload = copy ? JSON.parse(copy.payload_json) : generateTemplateCopy([{ name: 'Phone' }]);

    const req: PublishRequest = {
      videoPath: render.file_path,
      format: 'long',
      metadata: {
        title: copyPayload.titles[0],
        description: copyPayload.description,
        tags: copyPayload.tags,
        categoryId: '28',
        containsSyntheticMedia: true,
      },
    };

    const pubResult = await this.publisher.submit(req);

    this.db
      .prepare(
        `INSERT INTO publications (id, comparison_id, format, handoff_mode, handoff_ref, status, created_at)
         VALUES (?, ?, 'long', 'http', ?, ?, ?)`
      )
      .run(ulid(), comparisonId, pubResult.ref, pubResult.status, new Date().toISOString());

    this.db
      .prepare('UPDATE comparisons SET status = ?, updated_at = ? WHERE id = ?')
      .run('HANDED_OFF', new Date().toISOString(), comparisonId);

    this.queue.complete(job.id, pubResult);
  }
}
