// apps/worker/src/orchestrator.ts
// Pipeline Orchestrator: executes individual jobs from the queue and chains pipeline stages cleanly.
// Honors Manual Gate Mode (pauses at Gate A / Gate B) and Autopilot Mode (Auto-Judges + Hold Window).
// Specification: docs/PIPELINE_AND_JOBS.md, docs/VERDICT_RULES.md, docs/AUTOPILOT.md

import { existsSync, readFileSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { ulid } from 'ulid';
import {
  Database,
  Job,
  JobQueue,
  computeRanks,
  computeOverall,
  DEFAULT_CATEGORY_RULES,
  DISPLAY_ORDINAL_MAP,
  VIDEO_ORDINAL_MAP,
  CATEGORY_LABELS,
  parseNumber,
  parseResolution,
  parseIpRating,
  parseRefreshRate,
  parseCharging,
  validateNumbers,
  loadSocTiers,
  lookupSocTier,
  getStudioSettings,
  saveStudioSettings,
  getSettingValue,
  getFreeDiskGB,
  writeAuditLog,
  ComparisonInput,
  PhoneShape,
} from '@phone-studio/core';
import {
  LlmRouter,
  buildCopyAllPrompt,
  CopyAllSchema,
  generateTemplateCopy,
  formatFullYouTubeDescription,
  checkCopyRules,
  ensureShortsSuffix,
} from '@phone-studio/ai';
import {
  CandidateTrackerService,
  proposePairs,
  SpecCollector,
  PhoneCandidateForPair,
} from '@phone-studio/collectors';
import { Publisher, PublishRequest } from '@phone-studio/publisher';
import { RemotionRenderService } from './render-service.js';
import { AutopilotController } from './autopilot.js';

const MOTION_PRESETS = ['gradientDrift', 'blobs', 'gridBreath', 'rotatingShapes'] as const;

const BRAND_ACCENT_COLORS: Record<string, string> = {
  oneplus: '#EB0029',
  poco: '#F5A623',
  samsung: '#1428A0',
  apple: '#555555',
  xiaomi: '#FF6700',
  google: '#4285F4',
  nothing: '#E60012',
  motorola: '#001489',
  realme: '#FFC915',
  vivo: '#008CD6',
  oppo: '#00855A',
  iqoo: '#FFD000',
  asus: '#00539B',
  sony: '#1A1A1A',
  honor: '#00B4D8',
};

interface PhoneSpecRef {
  brand: string;
  model: string;
  variant?: string;
  specUrl?: string;
}

interface PhoneDbRow {
  id: string;
  brand: string;
  model: string;
  price_usd: number | null;
  price_note: string | null;
  accent: string | null;
  release_date: string | null;
  soc: string | null;
  soc_tier: number | null;
  shape_json: string | null;
}

export interface OrchestratorOptions {
  db: Database.Database;
  queue: JobQueue;
  router: LlmRouter;
  publisher?: Publisher;
  specCollector?: SpecCollector;
  tracker?: CandidateTrackerService;
  renderService?: RemotionRenderService;
  autopilot?: AutopilotController;
  dataDir?: string;
  configDir?: string;
  videoPublicDir?: string;
  minCategories?: number;
}

function parsePhoneRefs(rawJson: string): PhoneSpecRef[] {
  const parsed = JSON.parse(rawJson);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item) => {
    if (typeof item === 'string') {
      const parts = item.trim().split(/\s+/);
      return { brand: parts[0] || '', model: parts.slice(1).join(' ') };
    }
    return {
      brand: String(item.brand || ''),
      model: String(item.model || ''),
      variant: item.variant ? String(item.variant) : undefined,
      specUrl: item.specUrl ? String(item.specUrl) : undefined,
    };
  });
}

function parseDisplayTypeOrdinal(raw: string): number | null {
  const upper = raw.toUpperCase();
  if (upper.includes('LTPO')) return DISPLAY_ORDINAL_MAP['LTPO AMOLED'];
  if (upper.includes('AMOLED') || upper.includes('OLED')) return DISPLAY_ORDINAL_MAP['AMOLED'];
  if (upper.includes('IPS')) return DISPLAY_ORDINAL_MAP['IPS LCD'];
  if (upper.includes('LCD') || upper.includes('TFT') || upper.includes('TN') || upper.includes('VA')) {
    return DISPLAY_ORDINAL_MAP['LCD (TN/VA)'];
  }
  return null;
}

function parseVideoRecordingOrdinal(raw: string): number | null {
  const upper = raw.toUpperCase();
  if (upper.includes('8K')) {
    if (/8K[^0-9]*(30|60)/.test(upper)) return VIDEO_ORDINAL_MAP['8K30'];
    return VIDEO_ORDINAL_MAP['8K24'];
  }
  if (upper.includes('4K')) {
    if (/4K[^0-9]*(60|120)/.test(upper)) return VIDEO_ORDINAL_MAP['4K60'];
    return VIDEO_ORDINAL_MAP['4K30'];
  }
  if (upper.includes('1080P')) {
    if (/1080P[^0-9]*(60|120)/.test(upper)) return VIDEO_ORDINAL_MAP['1080p60'];
    return VIDEO_ORDINAL_MAP['1080p30'];
  }
  if (upper.includes('720P')) {
    return VIDEO_ORDINAL_MAP['720p30'];
  }
  return null;
}

/**
 * Parses a raw spec string into a deterministic comparable numeric score using packages/core parsers & ordinal tables.
 * Returns null if unparseable (Hard Rule #5: never guess, skip category if null).
 */
export function parseCategoryMetric(
  categoryKey: string,
  rawValue: string | null | undefined,
  socTiers: Record<string, number>,
  phoneSocTier?: number | null
): number | null {
  if (!rawValue || !rawValue.trim()) return null;

  switch (categoryKey) {
    case 'display_type':
      return parseDisplayTypeOrdinal(rawValue);
    case 'resolution':
      return parseResolution(rawValue)?.totalPixels ?? null;
    case 'refresh_rate':
      return parseRefreshRate(rawValue);
    case 'charging':
      return parseCharging(rawValue);
    case 'ip_rating':
      return parseIpRating(rawValue)?.score ?? null;
    case 'video_recording':
      return parseVideoRecordingOrdinal(rawValue);
    case 'chipset':
      return phoneSocTier ?? lookupSocTier(rawValue, socTiers);
    case 'software_support': {
      const yearMatch = rawValue.match(/(\d+)\s*(?:year|yr)/i);
      if (yearMatch) return parseInt(yearMatch[1], 10);
      const genMatch = rawValue.match(/(\d+)\s*(?:major|os|android|generation)/i);
      if (genMatch) return parseInt(genMatch[1], 10);
      return null;
    }
    case 'ram':
    case 'storage': {
      // Extract highest GB/TB capacity (convert TB to GB)
      const matches = Array.from(rawValue.matchAll(/(\d+(?:\.\d+)?)\s*(TB|GB)/gi));
      if (matches.length > 0) {
        const gbs = matches.map((m) => {
          const val = parseFloat(m[1]);
          return m[2].toUpperCase() === 'TB' ? val * 1024 : val;
        });
        return Math.max(...gbs);
      }
      return parseNumber(rawValue);
    }
    default:
      return parseNumber(rawValue);
  }
}

function formatSpecDisplay(categoryKey: string, rawValue: string): { primary: string; secondary?: string } {
  if (categoryKey === 'video_recording') {
    if (/8K/i.test(rawValue)) {
      const fpsMatch = rawValue.match(/8K@?(\d+fps|\d+)/i);
      const fps = fpsMatch ? `@${fpsMatch[1].replace(/fps/i, '')}fps` : '@24fps';
      return { primary: `8K ${fps}` };
    }
    if (/4K/i.test(rawValue)) {
      const fpsMatch = rawValue.match(/4K@?([0-9/]+fps|[0-9/]+)/i);
      const fps = fpsMatch ? `@${fpsMatch[1].replace(/fps/i, '')}fps` : '@60fps';
      return { primary: `4K ${fps}` };
    }
  }
  if (categoryKey === 'chipset') {
    return { primary: rawValue.replace(/^(Qualcomm|MediaTek)\s+/i, '').trim() };
  }
  if (categoryKey === 'weight') {
    const num = parseNumber(rawValue);
    return { primary: num !== null ? `${Math.round(num)} g` : rawValue };
  }
  if (categoryKey === 'battery') {
    const num = parseNumber(rawValue);
    if (num !== null && num > 1000) {
      return { primary: `${Math.round(num).toLocaleString('en-US')} mAh` };
    }
  }
  if (categoryKey === 'charging') {
    const watts = parseCharging(rawValue);
    if (watts !== null) {
      const hasWireless = /wireless/i.test(rawValue);
      return { primary: `${watts} W`, secondary: hasWireless ? 'Wired + Wireless' : undefined };
    }
  }
  if (categoryKey === 'resolution') {
    const res = parseResolution(rawValue);
    if (res) {
      return { primary: `${res.height} × ${res.width} px` };
    }
  }
  if (categoryKey === 'main_camera' || categoryKey === 'selfie_camera') {
    const match = rawValue.match(/(\d+)\s*MP/i);
    if (match) {
      return { primary: `${match[1]} MP`, secondary: /OIS/i.test(rawValue) ? 'OIS' : undefined };
    }
  }
  if (categoryKey === 'price') {
    const num = parseNumber(rawValue);
    return { primary: num !== null ? `$${Math.round(num)}` : rawValue };
  }
  if (rawValue.length > 30) {
    return { primary: rawValue.slice(0, 29) + '...' };
  }
  return { primary: rawValue };
}

export class PipelineOrchestrator {
  private db: Database.Database;
  private queue: JobQueue;
  private router: LlmRouter;
  private publisher?: Publisher;
  private specCollector: SpecCollector;
  private tracker: CandidateTrackerService;
  private renderService?: RemotionRenderService;
  private autopilot?: AutopilotController;
  private dataDir: string;
  private configDir: string;
  private videoPublicDir: string;
  private minCategories: number;

  constructor(opts: OrchestratorOptions) {
    this.db = opts.db;
    this.queue = opts.queue;
    this.router = opts.router;
    this.publisher = opts.publisher;
    this.specCollector = opts.specCollector ?? new SpecCollector(this.db, this.router);
    this.tracker = opts.tracker ?? new CandidateTrackerService(this.db);
    this.renderService = opts.renderService;
    this.autopilot = opts.autopilot;
    this.dataDir = opts.dataDir ?? join(process.cwd(), 'data');
    this.configDir = opts.configDir ?? join(process.cwd(), 'config');
    this.videoPublicDir = opts.videoPublicDir ?? join(process.cwd(), 'packages/video/public');
    this.minCategories = opts.minCategories ?? 6;
  }

  async executeJob(job: Job): Promise<void> {
    const payload = job.payload_json ? (JSON.parse(job.payload_json) as Record<string, unknown>) : {};

    switch (job.type) {
      case 'autopilot_tick':
        await this.handleAutopilotTick(job);
        break;
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
      case 'render_preview':
        await this.handleRenderPreview(job, payload);
        break;
      case 'render_final':
        await this.handleRenderFinal(job, payload);
        break;
      case 'render_thumbnail':
        await this.handleRenderThumbnail(job, payload);
        break;
      case 'handoff':
        await this.handleHandoff(job, payload);
        break;
      case 'cleanup':
        await this.handleCleanup(job);
        break;
      default:
        this.queue.complete(job.id, { skipped: true, reason: `No handler implemented for ${job.type}` });
        break;
    }
  }

  private loadPhonesForComparison(comparisonId: string): PhoneDbRow[] {
    const cmp = this.db
      .prepare('SELECT phone_ids_json FROM comparisons WHERE id = ?')
      .get(comparisonId) as { phone_ids_json: string } | undefined;

    if (!cmp) return [];
    const refs = parsePhoneRefs(cmp.phone_ids_json);
    const phones: PhoneDbRow[] = [];
    const seenIds = new Set<string>();

    for (const ref of refs) {
      // Exact brand + model match first; fallback to brand-only match ONLY if ref.model is empty (legacy test fixtures)
      const row = (ref.model
        ? this.db
          .prepare(
            `SELECT id, brand, model, price_usd, price_note, accent, release_date, soc, soc_tier, shape_json
               FROM phones
               WHERE LOWER(brand) = LOWER(?) AND LOWER(model) = LOWER(?)
               ORDER BY created_at DESC LIMIT 1`
          )
          .get(ref.brand, ref.model)
        : this.db
          .prepare(
            `SELECT id, brand, model, price_usd, price_note, accent, release_date, soc, soc_tier, shape_json
               FROM phones
               WHERE LOWER(brand) = LOWER(?)
               ORDER BY created_at DESC LIMIT 1`
          )
          .get(ref.brand)) as PhoneDbRow | undefined;

      if (row && !seenIds.has(row.id)) {
        seenIds.add(row.id);
        phones.push(row);
      }
    }
    return phones;
  }

  private assertDiskAndMusicLicense(jobId: string): boolean {
    const freeGB = getFreeDiskGB(this.dataDir);
    if (freeGB !== null && freeGB < 5) {
      this.queue.block(jobId, `Low disk space (${freeGB} GB free; >= 5 GB required before render)`);
      return false;
    }

    const licensePath = join(this.videoPublicDir, 'music', 'LICENSES.json');
    if (existsSync(this.videoPublicDir) && !existsSync(licensePath)) {
      this.queue.block(jobId, 'Missing packages/video/public/music/LICENSES.json (COMPLIANCE.md)');
      return false;
    }
    return true;
  }

  private selectNextMotionPreset(): (typeof MOTION_PRESETS)[number] {
    const settings = getStudioSettings(this.db);
    const last = settings.lastMotionPreset;
    const candidates = MOTION_PRESETS.filter((p) => p !== last);
    const chosen = candidates[Math.floor(Date.now() / 1000) % candidates.length] ?? 'gradientDrift';
    saveStudioSettings(this.db, { lastMotionPreset: chosen });
    return chosen;
  }

  private async handleAutopilotTick(job: Job): Promise<void> {
    if (!this.autopilot) {
      this.queue.complete(job.id, { action: 'skipped', reason: 'Autopilot controller not configured' });
      return;
    }
    this.queue.log(job.id, 'info', 'Running on-demand Autopilot scheduler tick...');
    const result = await this.autopilot.runSchedulerTick();
    this.queue.log(
      job.id,
      'info',
      `Autopilot tick result: ${result.action}${result.reason ? ` (${result.reason})` : ''}`
    );
    this.queue.complete(job.id, result);
  }

  private async handleTrackCandidates(job: Job): Promise<void> {
    this.queue.log(job.id, 'info', 'Starting multi-source RSS/Atom & Gemini candidate phone discovery...');
    const summary = await this.tracker.runDiscovery({
      includeRss: true,
      includeGemini: true,
      router: this.router,
    });
    this.queue.complete(job.id, summary);
  }

  private buildPricedCandidatePool(socTiers: Record<string, number>): PhoneCandidateForPair[] {
    // Only pair phones that have a known USD price (Hard Rule #5: never fabricate priceUSD)
    const phoneRows = this.db
      .prepare(
        `SELECT id, brand, model, price_usd, soc, soc_tier, release_date
         FROM phones
         WHERE price_usd IS NOT NULL AND price_usd > 0`
      )
      .all() as Array<{
        id: string;
        brand: string;
        model: string;
        price_usd: number;
        soc: string | null;
        soc_tier: number | null;
        release_date: string | null;
      }>;

    const candidateRows = this.db
      .prepare(
        `SELECT id, brand, model, estimated_price_usd, soc_name, announced_date, release_date
         FROM phone_candidates
         WHERE status != 'dismissed' AND estimated_price_usd IS NOT NULL AND estimated_price_usd > 0`
      )
      .all() as Array<{
        id: string;
        brand: string;
        model: string;
        estimated_price_usd: number;
        soc_name: string | null;
        announced_date: string | null;
        release_date: string | null;
      }>;

    const seen = new Set<string>();
    const pool: PhoneCandidateForPair[] = [];

    for (const p of phoneRows) {
      const key = `${p.brand.toLowerCase()}|${p.model.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push({
        id: p.id,
        brand: p.brand,
        model: p.model,
        priceUSD: p.price_usd,
        socTier: p.soc_tier ?? lookupSocTier(p.soc, socTiers) ?? undefined,
        releaseDate: p.release_date ?? undefined,
        hasSpecs: true,
      });
    }

    for (const c of candidateRows) {
      const key = `${c.brand.toLowerCase()}|${c.model.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push({
        id: c.id,
        brand: c.brand,
        model: c.model,
        priceUSD: c.estimated_price_usd,
        socTier: lookupSocTier(c.soc_name, socTiers) ?? undefined,
        releaseDate: c.release_date ?? c.announced_date ?? undefined,
        hasSpecs: false,
      });
    }

    return pool;
  }

  private filterFreshTopics(topics: ReturnType<typeof proposePairs>): ReturnType<typeof proposePairs> {
    const recentComparisons = this.db
      .prepare("SELECT title FROM comparisons WHERE created_at >= date('now', '-90 days')")
      .all() as Array<{ title: string | null }>;
    const recentTitles = new Set(recentComparisons.map((r) => (r.title || '').toLowerCase()));

    const existingTopics = this.db
      .prepare("SELECT phone_ids_json FROM topics WHERE status IN ('proposed', 'approved', 'rejected')")
      .all() as Array<{ phone_ids_json: string }>;
    const existingPairs = new Set<string>();
    for (const row of existingTopics) {
      try {
        const names = JSON.parse(row.phone_ids_json) as string[];
        if (Array.isArray(names) && names.length >= 2) {
          const sortedKey = names.map((n) => n.toLowerCase()).sort().join('||');
          existingPairs.add(sortedKey);
        }
      } catch {
        // ignore malformed row
      }
    }

    return topics.filter((topic) => {
      const pairTitleA = `${topic.phoneNames[0]} vs ${topic.phoneNames[1]}`.toLowerCase();
      const pairTitleB = `${topic.phoneNames[1]} vs ${topic.phoneNames[0]}`.toLowerCase();
      if (recentTitles.has(pairTitleA) || recentTitles.has(pairTitleB)) {
        return false;
      }
      const sortedKey = topic.phoneNames.map((n) => n.toLowerCase()).sort().join('||');
      return !existingPairs.has(sortedKey);
    });
  }

  private async handleFindTopics(job: Job): Promise<void> {
    this.queue.log(job.id, 'info', 'Finding comparison pairs from phones with known USD launch prices...');
    const socTiers = loadSocTiers(this.configDir);
    const settings = getStudioSettings(this.db);
    const minScore = settings.autopilot.topicScoreMin ?? 60;

    let pool = this.buildPricedCandidatePool(socTiers);
    let freshTopics = this.filterFreshTopics(proposePairs(pool, minScore));
    let discoveryTriggered = false;

    // Self-sustaining Autopilot discovery: if priced pool produces no fresh pairs,
    // automatically discover recent global smartphones via RSS + Gemini Grounded Search (1 cached LLM call).
    if (freshTopics.length === 0) {
      discoveryTriggered = true;
      this.queue.log(
        job.id,
        'info',
        `No fresh pairs from current priced pool (${pool.length} phones). Running automatic RSS + Gemini discovery...`
      );
      const discovery = await this.tracker.runDiscovery({
        includeRss: true,
        includeGemini: true,
        router: this.router,
      });
      this.queue.log(
        job.id,
        'info',
        `Discovery finished: ${discovery.totalFound} found (${discovery.geminiFound} via Gemini, ${discovery.inserted} inserted, ${discovery.updated} updated)${discovery.geminiError ? `; Gemini warning: ${discovery.geminiError}` : ''}`
      );
      pool = this.buildPricedCandidatePool(socTiers);
      freshTopics = this.filterFreshTopics(proposePairs(pool, minScore));
    }

    const toInsert = freshTopics.slice(0, 15);
    let inserted = 0;

    for (const topic of toInsert) {
      const topicId = ulid();
      const res = this.db
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
      if (Number(res.changes) > 0) {
        inserted++;
      }
    }

    this.queue.complete(job.id, {
      topicsFound: toInsert.length,
      newlyInserted: inserted,
      poolSize: pool.length,
      discoveryTriggered,
    });

    // If Autopilot is enabled and we just replenished Gate 0 with fresh topics,
    // trigger an immediate autopilot_tick so it starts without waiting for the next hourly interval.
    if (inserted > 0 && settings.autopilot.enabled && settings.autopilot.mode === 'autopilot') {
      const pendingTick = this.db
        .prepare("SELECT id FROM jobs WHERE type = 'autopilot_tick' AND state IN ('queued', 'running') LIMIT 1")
        .get();
      if (!pendingTick) {
        this.queue.enqueue('autopilot_tick');
      }
    }
  }

  private async handleCollectSpecs(job: Job, payload: Record<string, unknown>): Promise<void> {
    const comparisonId = job.comparison_id ?? String(payload.comparisonId || '');
    if (!comparisonId) {
      throw new Error('comparison_id is required for collect_specs');
    }

    const cmp = this.db
      .prepare('SELECT phone_ids_json FROM comparisons WHERE id = ?')
      .get(comparisonId) as { phone_ids_json: string } | undefined;

    if (!cmp) {
      throw new Error(`Comparison not found: ${comparisonId}`);
    }

    const phones = parsePhoneRefs(cmp.phone_ids_json);
    const results = [];

    const forceRefresh = Boolean(payload.forceRefresh);
    for (let i = 0; i < phones.length; i++) {
      const p = phones[i];
      this.queue.log(job.id, 'info', `Collecting specs for ${p.brand} ${p.model}${forceRefresh ? ' (force refresh)' : ''}...`);
      const res = await this.specCollector.collect({ ...p, forceRefresh });
      results.push(res);
      this.queue.progress(job.id, Math.round(((i + 1) / phones.length) * 100));
    }

    // Per PIPELINE_AND_JOBS.md: land cleanly at COLLECTED (Gate A)
    this.db
      .prepare(`UPDATE comparisons SET status = 'COLLECTED', updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), comparisonId);

    this.queue.complete(job.id, { collectedCount: results.length });

    // In Autopilot mode, run Data Judge automatically; in Manual mode, wait for human Gate A approval
    const settings = getStudioSettings(this.db);
    if (settings.autopilot.mode === 'autopilot' && this.autopilot) {
      const judge = this.autopilot.evaluateDataJudge(comparisonId);
      if (judge.passed) {
        this.db
          .prepare(`UPDATE comparisons SET status = 'DATA_APPROVED', updated_at = ? WHERE id = ?`)
          .run(new Date().toISOString(), comparisonId);
        this.queue.enqueue('compute_verdict', { comparisonId });
      }
    }
  }

  private async handleComputeVerdict(job: Job, payload: Record<string, unknown>): Promise<void> {
    const comparisonId = job.comparison_id ?? String(payload.comparisonId || '');
    this.queue.log(job.id, 'info', `Computing deterministic verdict for comparison ${comparisonId}...`);

    const phones = this.loadPhonesForComparison(comparisonId);
    if (phones.length < 2) {
      throw new Error('Need at least 2 collected phones to compute comparison verdict');
    }

    const socTiers = loadSocTiers(this.configDir);
    const excludedSet = new Set<string>(
      getSettingValue<string[]>(this.db, `excluded_categories:${comparisonId}`) ?? []
    );

    const categories: Array<{
      key: string;
      label: string;
      values: Array<{ primary: string; secondary?: string }>;
      ranking: number[];
      weight: number;
    }> = [];

    const skippedCategories: Array<{ key: string; reason: string }> = [];

    for (const [key, rule] of Object.entries(DEFAULT_CATEGORY_RULES)) {
      if (excludedSet.has(key)) {
        skippedCategories.push({ key, reason: 'excluded' });
        continue;
      }

      const specs = phones.map((p) => {
        const spec = this.db
          .prepare('SELECT raw_value, confidence, conflict FROM spec_values WHERE phone_id = ? AND category_key = ?')
          .get(p.id, key) as
          | { raw_value: string | null; confidence: number | null; conflict: number | null }
          | undefined;
        return spec ?? null;
      });

      // VERDICT_RULES.md §1: auto-skip category if any phone has null/missing value, conflict, or unresolved low confidence
      if (specs.some((s) => !s || !s.raw_value || !s.raw_value.trim())) {
        skippedCategories.push({ key, reason: 'missing_value' });
        continue;
      }
      if (specs.some((s) => (s!.conflict ?? 0) === 1)) {
        skippedCategories.push({ key, reason: 'conflict' });
        continue;
      }
      if (specs.some((s) => s!.confidence !== null && s!.confidence !== undefined && s!.confidence < 0.4)) {
        skippedCategories.push({ key, reason: 'low_confidence (<40%)' });
        continue;
      }

      const parsedMetrics = specs.map((s, idx) =>
        parseCategoryMetric(key, s!.raw_value, socTiers, phones[idx].soc_tier)
      );

      // Never guess on parse failure -> skip category
      if (parsedMetrics.some((v) => v === null)) {
        skippedCategories.push({ key, reason: 'unparseable_metric' });
        continue;
      }

      const numValues = parsedMetrics as number[];
      const ranking = computeRanks(numValues, rule.rule, rule.tieEps, rule.isPercentageEps);

      categories.push({
        key,
        label: CATEGORY_LABELS[key] ?? key,
        values: specs.map((s) => formatSpecDisplay(key, s!.raw_value!)),
        ranking,
        weight: rule.weight,
      });
    }

    if (skippedCategories.length > 0) {
      const summaryText = skippedCategories.map((s) => `${s.key} (${s.reason})`).join(', ');
      this.queue.log(job.id, 'info', `Included ${categories.length} categories; skipped ${skippedCategories.length}: ${summaryText}`);
    }

    if (categories.length < this.minCategories) {
      const reasonSummary = skippedCategories
        .slice(0, 6)
        .map((s) => `${s.key}: ${s.reason}`)
        .join('; ');
      const blockMsg = `Blocked render: only ${categories.length} valid categories (minimum ${this.minCategories} required). Skipped: ${reasonSummary}. Click "Re-collect Specs" or verify red cells in Gate A first.`;
      this.db
        .prepare(`UPDATE comparisons SET status = 'COLLECTED', updated_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), comparisonId);
      this.queue.block(job.id, blockMsg);
      return;
    }

    const overall = computeOverall(categories, phones.length);
    const motionPreset = this.selectNextMotionPreset();

    // Load complete benchmark segments (AnTuTu, Geekbench) if ALL phones have scores
    const benchmarks: Array<{
      id: string;
      source: string;
      title: string;
      version: string;
      updated: string;
      sourceUrl: string;
      subtitle: string;
      parts: Array<{ key: string; label: string }>;
      scores: Array<{ main: number; parts: Record<string, number> }>;
    }> = [];

    const benchmarkDefs = [
      {
        id: 'antutu',
        query: "SELECT * FROM benchmark_snapshots WHERE LOWER(source) LIKE '%antutu%' ORDER BY taken_at DESC LIMIT 1",
        titlePrefix: 'AnTuTu',
        subtitleSuffix: 'Total Score',
        parts: [
          { key: 'cpu', label: 'CPU' },
          { key: 'gpu', label: 'GPU' },
          { key: 'mem', label: 'MEM' },
          { key: 'ux', label: 'UX' },
        ],
      },
      {
        id: 'geekbench',
        query: "SELECT * FROM benchmark_snapshots WHERE LOWER(source) LIKE '%geekbench%' ORDER BY taken_at DESC LIMIT 1",
        titlePrefix: 'Geekbench',
        subtitleSuffix: 'Multi-Core Score',
        parts: [
          { key: 'single', label: 'Single-Core' },
          { key: 'multi', label: 'Multi-Core' },
        ],
      },
    ];

    for (const def of benchmarkDefs) {
      const snap = this.db.prepare(def.query).get() as
        | { id: string; source: string; version: string; period: string; source_url: string | null }
        | undefined;
      if (!snap) continue;

      const scores = phones.map((p) => {
        const row = this.db
          .prepare('SELECT main, parts_json FROM benchmark_scores WHERE snapshot_id = ? AND phone_id = ?')
          .get(snap.id, p.id) as { main: number; parts_json: string } | undefined;
        if (!row) return null;
        let parts: Record<string, number> = {};
        try {
          parts = JSON.parse(row.parts_json || '{}');
        } catch {
          parts = {};
        }
        return { main: row.main, parts };
      });

      if (scores.every((s): s is { main: number; parts: Record<string, number> } => s !== null)) {
        benchmarks.push({
          id: def.id,
          source: snap.source,
          title: `${def.titlePrefix} ${snap.version} Benchmark`,
          version: snap.version,
          updated: snap.period,
          sourceUrl: snap.source_url || 'https://manual-import.local',
          subtitle: `${snap.source} ${snap.version} · ${def.subtitleSuffix}`,
          parts: def.parts,
          scores,
        });
      }
    }

    const credits = ['Manufacturer published specifications'];
    for (const b of benchmarks) {
      credits.push(`${b.source} ${b.version} (${b.updated})`);
    }

    // All-or-nothing visual uniformity: only attach real photos if EVERY phone in this comparison
    // has a verified licensed photo; otherwise use Parametric Phone uniformly for all devices.
    const resolvedImages = phones.map((p) =>
      this.db
        .prepare(
          `SELECT file_path, license, source_url, accessed_at, author
           FROM images
           WHERE phone_id = ? AND status = 'ok' AND license IS NOT NULL AND license != ''
           ORDER BY CASE kind WHEN 'front' THEN 1 WHEN 'hero' THEN 2 WHEN 'back' THEN 3 ELSE 4 END ASC
           LIMIT 1`
        )
        .get(p.id) as
        | { file_path: string; license: string; source_url: string | null; accessed_at: string | null; author: string | null }
        | undefined
    );
    const allHaveLicensedImage = resolvedImages.every((img) => Boolean(img && img.file_path));
    if (!allHaveLicensedImage && resolvedImages.some((img) => Boolean(img && img.file_path))) {
      this.queue.log(
        job.id,
        'info',
        'Only some phones have licensed images; using uniform Parametric Phone for all phones in this video.'
      );
    }

    const finalComparisonJson: ComparisonInput & { themePreset: string; phones: Array<ComparisonInput['phones'][number] & { shape?: PhoneShape }> } = {
      id: comparisonId,
      themePreset: motionPreset,
      phones: phones.map((p, idx) => {
        const brandKey = (p.brand ?? '').toLowerCase();
        const brandColor = BRAND_ACCENT_COLORS[brandKey] ?? '#1a1a1a';
        const imgRow = allHaveLicensedImage ? resolvedImages[idx] : undefined;

        let parsedShape: PhoneShape | undefined;
        if (p.shape_json) {
          try {
            parsedShape = JSON.parse(p.shape_json) as PhoneShape;
          } catch {
            parsedShape = undefined;
          }
        }

        return {
          id: p.id,
          name: `${p.brand} ${p.model}`,
          accent: p.accent || brandColor,
          ...(typeof p.price_usd === 'number' && p.price_usd > 0 ? { priceUSD: p.price_usd } : {}),
          ...(p.soc ? { soc: p.soc } : {}),
          ...(p.release_date ? { releaseDate: p.release_date } : {}),
          ...(p.price_note ? { priceNote: p.price_note } : {}),
          ...(parsedShape ? { shape: parsedShape } : {}),
          ...(imgRow && imgRow.file_path
            ? {
              image: {
                src: imgRow.file_path,
                license: imgRow.license,
                sourceUrl: imgRow.source_url || 'https://verified.local',
                accessedAt: (imgRow.accessed_at || new Date().toISOString()).slice(0, 10),
                ...(imgRow.author ? { author: imgRow.author } : {}),
              },
            }
            : {}),
        };
      }),
      categories,
      overall,
      benchmarks,
      hook: (() => {
        const prices = phones.map((p) => p.price_usd).filter((p): p is number => typeof p === 'number' && p > 0);
        const samePrice = prices.length >= 2 && prices.every((p) => p === prices[0]);
        return samePrice ? `Same $${prices[0]} price. Who wins?` : `Specs showdown: Who wins?`;
      })(),
      market: 'global',
      currency: 'USD',
      credits,
    };

    this.db
      .prepare(`UPDATE comparisons SET final_json = ?, status = 'DATA_APPROVED', updated_at = ? WHERE id = ?`)
      .run(JSON.stringify(finalComparisonJson), new Date().toISOString(), comparisonId);

    this.queue.complete(job.id, { overallWinnerRank: overall.ranking, categoryCount: categories.length });
    this.queue.enqueue('generate_copy', { comparisonId });
  }

  private async handleGenerateCopy(job: Job, payload: Record<string, unknown>): Promise<void> {
    const comparisonId = job.comparison_id ?? String(payload.comparisonId || '');
    this.queue.log(job.id, 'info', `Generating YouTube copy for comparison ${comparisonId}...`);

    const cmp = this.db
      .prepare('SELECT final_json, formats_json FROM comparisons WHERE id = ?')
      .get(comparisonId) as { final_json: string | null; formats_json: string } | undefined;

    if (!cmp?.final_json) {
      throw new Error(`Comparison final_json not found for ${comparisonId}`);
    }

    const data = JSON.parse(cmp.final_json) as ComparisonInput;
    const winnerIndexes = data.overall
      ? data.overall.ranking
        .map((r, idx) => (r === 1 ? idx : -1))
        .filter((idx) => idx >= 0)
      : [];
    const winnerName =
      winnerIndexes.length === 1 ? data.phones[winnerIndexes[0]]?.name : undefined;

    let copyData;
    let promptId = 'template@v1';
    let promptVersion = 'v1';
    let provider = 'template';
    let model = 'template';

    try {
      const prompt = buildCopyAllPrompt({
        phones: data.phones.map((p) => ({ name: p.name, priceUSD: p.priceUSD })),
        categories: data.categories.map((c) => ({
          key: c.key,
          label: c.label,
          winnerNames: c.ranking
            .map((r, idx) => (r === 1 ? data.phones[idx].name : null))
            .filter((n): n is string => Boolean(n)),
          tie: c.ranking.filter((r) => r === 1).length > 1,
        })),
        overall: data.overall
          ? {
            winnerName: winnerName ?? 'Tie',
            tie: winnerIndexes.length !== 1,
            points: data.overall.points,
          }
          : undefined,
        benchmarks: (data.benchmarks ?? []).map((b) => {
          const maxScore = Math.max(...b.scores.map((s) => s?.main ?? -Infinity));
          const winIdx = b.scores.findIndex((s) => s?.main === maxScore);
          return {
            title: b.title,
            winnerName: winIdx >= 0 ? data.phones[winIdx].name : 'Tie',
          };
        }),
      });

      const res = await this.router.callJson({
        task: 'copy_all',
        promptId: prompt.promptId,
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        schema: CopyAllSchema,
        temperature: 0.6,
        comparisonId,
      });

      const candidate = res.data;
      candidate.shortTitles = ensureShortsSuffix(candidate.shortTitles);

      // Copy Judge (Hard Rule #3 + PROMPTS.md §3): validate numbers & banned words before accepting AI copy
      const offenders = validateNumbers(data, [
        ...candidate.titles,
        candidate.hook,
        candidate.description,
      ]);
      const ruleIssues = checkCopyRules(candidate);

      if (offenders.length > 0 || ruleIssues.length > 0) {
        this.queue.log(
          job.id,
          'warn',
          `AI copy failed compliance check (offenders=${offenders.map((o) => o.token).join(',')}; rules=${ruleIssues.join('; ')}). Falling back to deterministic template copy.`
        );
        copyData = generateTemplateCopy(data.phones, winnerName);
        copyData.shortTitles = ensureShortsSuffix(copyData.shortTitles);
      } else {
        copyData = candidate;
        promptId = prompt.promptId;
        promptVersion = prompt.promptId.split('@')[1] || 'v1';
        provider = res.provider;
        model = res.model;
      }
    } catch (err) {
      this.queue.log(job.id, 'warn', `AI copy generation failed, using template copy fallback: ${err}`);
      copyData = generateTemplateCopy(data.phones, winnerName);
      copyData.shortTitles = ensureShortsSuffix(copyData.shortTitles);
    }

    copyData.description = formatFullYouTubeDescription({
      introDescription: copyData.description,
      phones: data.phones.map((p) => ({ name: p.name, priceUSD: p.priceUSD, hasImage: Boolean(p.image) })),
      categories: data.categories,
      benchmarks: (data.benchmarks ?? []).map((b) => ({ title: b.title })),
      credits: data.credits,
      hook: copyData.hook,
      hashtags: copyData.hashtags,
    });

    // Idempotent overwrite for copy_assets per comparison
    this.db.prepare('DELETE FROM copy_assets WHERE comparison_id = ?').run(comparisonId);
    this.db
      .prepare(
        `INSERT INTO copy_assets (id, comparison_id, kind, payload_json, prompt_id, prompt_version, provider, model, created_at)
         VALUES (?, ?, 'all', ?, ?, ?, ?, ?, ?)`
      )
      .run(
        ulid(),
        comparisonId,
        JSON.stringify(copyData),
        promptId,
        promptVersion,
        provider,
        model,
        new Date().toISOString()
      );

    data.hook = copyData.hook;
    this.db
      .prepare(`UPDATE comparisons SET final_json = ?, status = 'COPY_READY', updated_at = ? WHERE id = ?`)
      .run(JSON.stringify(data), new Date().toISOString(), comparisonId);

    this.queue.complete(job.id, { copyGenerated: true, provider, model, titles: copyData.titles });

    let formats: string[] = ['long', 'short'];
    try {
      const parsed = JSON.parse(cmp.formats_json || '["long","short"]');
      if (Array.isArray(parsed) && parsed.length > 0) formats = parsed;
    } catch {
      // default both
    }

    for (const fmt of formats) {
      this.queue.enqueue('render_preview', { comparisonId, payload: { format: fmt } });
    }
    this.queue.enqueue('render_thumbnail', { comparisonId, payload: { stage: 'preview' } });
  }

  private resolveComposition(
    comparisonId: string,
    comparisonData: ComparisonInput & { themePreset?: string },
    themeVersion: string | null,
    format: string
  ): { compId: string; inputProps: { comparison: ComparisonInput;[key: string]: unknown } } {
    const theme = (themeVersion || 'v3').toLowerCase();
    const motionPreset = comparisonData.themePreset || 'gradientDrift';
    const n = comparisonData.phones.length;

    if (theme === 'v1') {
      return {
        compId: format === 'short' ? `ShortVideo${n}` : `LongVideo${n}`,
        inputProps: { comparison: comparisonData },
      };
    }
    if (theme === 'v2') {
      return {
        compId: format === 'short' ? `ShortV2-${n}` : `LongV2-${n}`,
        inputProps: { comparison: comparisonData, format, motionPreset, seed: comparisonId },
      };
    }
    return {
      compId: format === 'short' ? `ShortV3-${n}` : `LongV3-${n}`,
      inputProps: { comparison: comparisonData, format, motionPreset, seed: comparisonId },
    };
  }

  private upsertRenderRecord(
    comparisonId: string,
    format: string,
    stage: 'preview' | 'final',
    filePath: string
  ): void {
    const sizeBytes = existsSync(filePath) ? statSync(filePath).size : 0;
    this.db
      .prepare('DELETE FROM renders WHERE comparison_id = ? AND format = ? AND stage = ?')
      .run(comparisonId, format, stage);
    this.db
      .prepare(
        `INSERT INTO renders (id, comparison_id, format, stage, file_path, size_bytes, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'ok', ?)`
      )
      .run(ulid(), comparisonId, format, stage, filePath, sizeBytes, new Date().toISOString());
  }

  private async handleRenderPreview(job: Job, payload: Record<string, unknown>): Promise<void> {
    if (!this.renderService) {
      this.queue.log(job.id, 'warn', 'RenderService not configured, skipping preview render');
      this.queue.complete(job.id, { skipped: true });
      return;
    }

    if (!this.assertDiskAndMusicLicense(job.id)) return;

    const comparisonId = job.comparison_id ?? String(payload.comparisonId || '');
    const format = String(payload.format || 'long');
    this.queue.log(job.id, 'info', `Rendering preview video (${format}) for comparison ${comparisonId}...`);

    const cmp = this.db
      .prepare('SELECT final_json, theme_version, formats_json FROM comparisons WHERE id = ?')
      .get(comparisonId) as { final_json: string | null; theme_version: string | null; formats_json: string } | undefined;

    if (!cmp?.final_json) {
      throw new Error(`Comparison final_json not found for ${comparisonId}`);
    }

    const comparisonData = JSON.parse(cmp.final_json) as ComparisonInput & { themePreset?: string };
    const { compId, inputProps } = this.resolveComposition(comparisonId, comparisonData, cmp.theme_version, format);
    const outputPath = join(this.dataDir, 'renders', `${comparisonId}-preview-${format}.mp4`);

    // Fast preview settings: scale 0.4 -> 768x432 (16:9) and 432x768 (9:16), both exact multiples of 16
    await this.renderService.renderVideo({
      compositionId: compId,
      inputProps,
      outputPath,
      scale: 0.4,
      crf: 30,
      onProgress: (pct) => this.queue.progress(job.id, pct),
    });

    this.upsertRenderRecord(comparisonId, format, 'preview', outputPath);
    this.queue.complete(job.id, { outputPath });

    // Check if ALL expected preview formats are rendered
    const expectedFormats: string[] = JSON.parse(cmp.formats_json || '["long","short"]');
    const doneCount = expectedFormats.filter((fmt) =>
      Boolean(
        this.db
          .prepare("SELECT id FROM renders WHERE comparison_id = ? AND format = ? AND stage = 'preview' AND status = 'ok'")
          .get(comparisonId, fmt)
      )
    ).length;

    if (doneCount >= expectedFormats.length) {
      this.db
        .prepare(`UPDATE comparisons SET status = 'PREVIEW_RENDERED', updated_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), comparisonId);

      // In Autopilot mode, run Video Judge (Gate B Auto)
      const settings = getStudioSettings(this.db);
      if (settings.autopilot.mode === 'autopilot' && this.autopilot) {
        const judge = this.autopilot.evaluateVideoJudge(comparisonId);
        if (judge.passed) {
          this.db
            .prepare(`UPDATE comparisons SET status = 'VIDEO_APPROVED', updated_at = ? WHERE id = ?`)
            .run(new Date().toISOString(), comparisonId);
          for (const fmt of expectedFormats) {
            this.queue.enqueue('render_final', { comparisonId, payload: { format: fmt } });
          }
          this.queue.enqueue('render_thumbnail', { comparisonId, payload: { stage: 'final' } });
        }
      }
    }
  }

  private async handleRenderFinal(job: Job, payload: Record<string, unknown>): Promise<void> {
    if (!this.renderService) {
      this.queue.complete(job.id, { skipped: true });
      return;
    }

    if (!this.assertDiskAndMusicLicense(job.id)) return;

    const comparisonId = job.comparison_id ?? String(payload.comparisonId || '');
    const format = String(payload.format || 'long');
    this.queue.log(job.id, 'info', `Rendering FINAL 1080p video (${format}) for comparison ${comparisonId}...`);

    const cmp = this.db
      .prepare('SELECT final_json, theme_version, formats_json FROM comparisons WHERE id = ?')
      .get(comparisonId) as { final_json: string | null; theme_version: string | null; formats_json: string } | undefined;

    if (!cmp?.final_json) {
      throw new Error(`Comparison final_json not found for ${comparisonId}`);
    }

    const comparisonData = JSON.parse(cmp.final_json) as ComparisonInput & { themePreset?: string };
    const { compId, inputProps } = this.resolveComposition(comparisonId, comparisonData, cmp.theme_version, format);
    const outputPath = join(this.dataDir, 'renders', `${comparisonId}-final-${format}.mp4`);

    await this.renderService.renderVideo({
      compositionId: compId,
      inputProps,
      outputPath,
      scale: 1.0,
      crf: 18,
      onProgress: (pct) => this.queue.progress(job.id, pct),
    });

    this.upsertRenderRecord(comparisonId, format, 'final', outputPath);
    this.queue.complete(job.id, { outputPath });

    this.checkAllFinalRendersComplete(comparisonId, cmp.formats_json);
  }

  private async handleRenderThumbnail(job: Job, payload: Record<string, unknown>): Promise<void> {
    if (!this.renderService) {
      this.queue.complete(job.id, { skipped: true });
      return;
    }

    const comparisonId = job.comparison_id ?? String(payload.comparisonId || '');
    const stage: 'preview' | 'final' = payload.stage === 'preview' ? 'preview' : 'final';
    this.queue.log(job.id, 'info', `Rendering YouTube thumbnail (${stage}) for comparison ${comparisonId}...`);

    const cmp = this.db
      .prepare('SELECT final_json, theme_version, formats_json FROM comparisons WHERE id = ?')
      .get(comparisonId) as { final_json: string | null; theme_version: string | null; formats_json: string } | undefined;

    if (!cmp?.final_json) {
      throw new Error(`Comparison final_json not found for ${comparisonId}`);
    }

    const comparisonData = JSON.parse(cmp.final_json) as ComparisonInput;
    const theme = (cmp.theme_version || 'v3').toLowerCase();
    const n = comparisonData.phones.length;

    const compId = theme === 'v1' ? `Thumbnail${n}` : theme === 'v2' ? `ThumbnailV2-${n}` : `ThumbnailV3-${n}`;
    const inputProps =
      theme === 'v1'
        ? { comparison: comparisonData }
        : { comparison: comparisonData, text: n === 2 ? 'WHO WINS?' : 'WHICH ONE?' };

    const outputPath = join(this.dataDir, 'renders', `${comparisonId}-thumb.png`);

    await this.renderService.renderThumbnail({
      compositionId: compId,
      inputProps,
      outputPath,
    });

    // Check thumbnail size rule (VIDEO_SPEC.md §4: <= 2 MB)
    if (existsSync(outputPath)) {
      const sizeBytes = statSync(outputPath).size;
      if (sizeBytes > 2 * 1024 * 1024) {
        this.queue.log(job.id, 'warn', `Thumbnail PNG exceeds 2 MB (${(sizeBytes / 1024 / 1024).toFixed(2)} MB)`);
      }
    }

    this.upsertRenderRecord(comparisonId, 'thumbnail', stage, outputPath);
    this.queue.complete(job.id, { thumbnailPath: outputPath });

    if (stage === 'final') {
      this.checkAllFinalRendersComplete(comparisonId, cmp.formats_json);
    }
  }

  private checkAllFinalRendersComplete(comparisonId: string, formatsJson: string): void {
    const expectedFormats: string[] = JSON.parse(formatsJson || '["long","short"]');
    const allVideosDone = expectedFormats.every((fmt) =>
      Boolean(
        this.db
          .prepare("SELECT id FROM renders WHERE comparison_id = ? AND format = ? AND stage = 'final' AND status = 'ok'")
          .get(comparisonId, fmt)
      )
    );
    const thumbDone = Boolean(
      this.db
        .prepare("SELECT id FROM renders WHERE comparison_id = ? AND format = 'thumbnail' AND stage = 'final' AND status = 'ok'")
        .get(comparisonId)
    );

    if (!allVideosDone || !thumbDone) return;

    this.db
      .prepare(`UPDATE comparisons SET status = 'FINAL_RENDERED', updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), comparisonId);

    // Delete preview MP4s after final approval per ARCHITECTURE.md §7
    const previews = this.db
      .prepare("SELECT file_path FROM renders WHERE comparison_id = ? AND stage = 'preview' AND format != 'thumbnail'")
      .all(comparisonId) as Array<{ file_path: string }>;
    for (const pr of previews) {
      if (pr.file_path && existsSync(pr.file_path)) {
        try {
          unlinkSync(pr.file_path);
        } catch {
          // ignore if already removed
        }
      }
    }

    // In Autopilot mode, schedule hold window or immediate handoff
    const settings = getStudioSettings(this.db);
    if (settings.autopilot.mode === 'autopilot' && this.autopilot) {
      this.autopilot.scheduleHoldOrHandoff(comparisonId);
    }
  }

  private async handleHandoff(job: Job, payload: Record<string, unknown>): Promise<void> {
    if (!this.publisher) {
      this.queue.block(job.id, 'Publisher is not configured (set PUBLISH_MODE / YTAGENT_BASE_URL in .env)');
      return;
    }

    const comparisonId = job.comparison_id ?? String(payload.comparisonId || '');
    const visibility = (payload.visibility as 'private' | 'unlisted' | 'public') ?? 'private';
    const publishAt = payload.publishAt ? String(payload.publishAt) : undefined;

    const finalRenders = this.db
      .prepare(
        `SELECT format, file_path FROM renders
         WHERE comparison_id = ? AND stage = 'final' AND format IN ('long', 'short') AND status = 'ok'`
      )
      .all(comparisonId) as Array<{ format: 'long' | 'short'; file_path: string }>;

    if (finalRenders.length === 0) {
      throw new Error(`No final render files found for comparison ${comparisonId}`);
    }

    const thumbRender = this.db
      .prepare("SELECT file_path FROM renders WHERE comparison_id = ? AND format = 'thumbnail' ORDER BY created_at DESC LIMIT 1")
      .get(comparisonId) as { file_path: string } | undefined;

    const copy = this.db
      .prepare('SELECT payload_json FROM copy_assets WHERE comparison_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(comparisonId) as { payload_json: string } | undefined;

    const copyPayload = copy ? JSON.parse(copy.payload_json) : generateTemplateCopy([{ name: 'Phone' }]);
    const results = [];

    for (const render of finalRenders) {
      const isShort = render.format === 'short';
      const title = isShort
        ? copyPayload.shortTitles?.[0] || `${copyPayload.titles[0]} #Shorts`
        : String(payload.title || copyPayload.titles[0]);

      const crossLinkNote = isShort
        ? '\n\nWatch the full in-depth 16:9 breakdown on our channel!'
        : '\n\nWatch the quick 9:16 Shorts summary on our channel!';

      const req: PublishRequest = {
        videoPath: render.file_path,
        format: render.format,
        thumbnailPath: !isShort ? thumbRender?.file_path : undefined,
        visibility,
        publishAt,
        metadata: {
          title,
          description: `${copyPayload.description}${crossLinkNote}`,
          tags: copyPayload.tags || [],
          categoryId: '28',
          language: 'en',
          madeForKids: false,
          containsSyntheticMedia: true,
        },
      };

      const pubResult = await this.publisher.submit(req);
      results.push({ format: render.format, ...pubResult });

      this.db
        .prepare(
          `INSERT INTO publications (id, comparison_id, format, handoff_mode, handoff_ref, scheduled_at, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          ulid(),
          comparisonId,
          render.format,
          process.env.PUBLISH_MODE || 'http',
          pubResult.ref,
          publishAt ?? null,
          pubResult.status,
          new Date().toISOString()
        );
    }

    this.db
      .prepare(`UPDATE comparisons SET status = 'HANDED_OFF', updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), comparisonId);

    writeAuditLog(this.db, 'worker', 'handoff_complete', comparisonId, { results });
    this.queue.complete(job.id, { submitted: results });
  }

  private async handleCleanup(job: Job): Promise<void> {
    this.queue.log(job.id, 'info', 'Running disk retention cleanup (ARCHITECTURE.md §7)...');
    let filesDeleted = 0;

    // 1. Delete old final renders > 14 days after PUBLISHED
    const oldPublished = this.db
      .prepare(
        `SELECT r.id, r.file_path
         FROM renders r
         JOIN comparisons c ON c.id = r.comparison_id
         WHERE c.status = 'PUBLISHED' AND c.updated_at <= date('now', '-14 days')`
      )
      .all() as Array<{ id: string; file_path: string }>;

    for (const row of oldPublished) {
      if (row.file_path && existsSync(row.file_path)) {
        try {
          unlinkSync(row.file_path);
          filesDeleted++;
        } catch {
          // ignore
        }
      }
    }

    this.queue.complete(job.id, { filesDeleted, freeDiskGB: getFreeDiskGB(this.dataDir) });
  }
}
