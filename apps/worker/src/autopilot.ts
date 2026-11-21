// apps/worker/src/autopilot.ts
// Autopilot Controller & Automatic Judges (Data Judge & Video Judge).
// Specification: docs/AUTOPILOT.md

import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { join } from 'path';
import { ulid } from 'ulid';
import { JobQueue, validateNumbers } from '@phone-studio/core';

export interface AutopilotSettings {
  enabled: boolean;
  videosPerWeek: number;
  topicScoreMin: number;
  minCategories: number;
  requiredCategories: string[];
  minConfidence: number;
  holdHours: number;
  maxConsecutiveFailures: number;
}

export const DEFAULT_AUTOPILOT_SETTINGS: AutopilotSettings = {
  enabled: true,
  videosPerWeek: 4,
  topicScoreMin: 60,
  minCategories: 8,
  requiredCategories: ['price', 'battery', 'display_type', 'chipset'],
  minConfidence: 0.75,
  holdHours: 24,
  maxConsecutiveFailures: 2,
};

export class AutopilotController {
  private consecutiveFailures = 0;
  private isPaused = false;

  constructor(
    private db: Database.Database,
    private queue: JobQueue,
    private dataDir: string
  ) {}

  /**
   * Main scheduler tick — runs every hour (or scheduled interval).
   */
  async runSchedulerTick(): Promise<{ action: string; reason?: string }> {
    // 1. Check kill switch (data/PAUSE file or internal brake)
    const pauseFile = join(this.dataDir, 'PAUSE');
    if (existsSync(pauseFile) || this.isPaused) {
      return { action: 'paused', reason: 'Autopilot is paused via safety brakes or PAUSE file' };
    }

    // 2. Check weekly target
    const currentWeekCount = this.getVideosProducedThisWeek();
    if (currentWeekCount >= DEFAULT_AUTOPILOT_SETTINGS.videosPerWeek) {
      return { action: 'idle', reason: `Weekly quota fulfilled (${currentWeekCount}/${DEFAULT_AUTOPILOT_SETTINGS.videosPerWeek})` };
    }

    // 3. Check if there is already an active running comparison
    const activeComp = this.db
      .prepare("SELECT id, status FROM comparisons WHERE status NOT IN ('HANDED_OFF', 'PUBLISHED', 'FAILED', 'SKIPPED_LOW_DATA') LIMIT 1")
      .get() as { id: string; status: string } | undefined;

    if (activeComp) {
      return { action: 'active_comparison', reason: `Comparison ${activeComp.id} currently in progress (${activeComp.status})` };
    }

    // 4. Select best candidate topic
    const bestTopic = this.db
      .prepare('SELECT * FROM topics WHERE status = "proposed" AND score >= ? ORDER BY score DESC LIMIT 1')
      .get(DEFAULT_AUTOPILOT_SETTINGS.topicScoreMin) as any;

    if (!bestTopic) {
      // Trigger topic finder job
      this.queue.enqueue('find_topics');
      return { action: 'enqueued_find_topics', reason: 'No proposed topics >= score threshold' };
    }

    // 5. Auto Gate 0 Approval: Create comparison and enqueue specs collection
    const comparisonId = ulid();
    const now = new Date().toISOString();
    const phoneNames: string[] = JSON.parse(bestTopic.phone_ids_json);
    const phonesPayload = phoneNames.map((name) => {
      const parts = name.split(' ');
      return { brand: parts[0], model: parts.slice(1).join(' ') };
    });

    this.db.prepare(`
      INSERT INTO comparisons (id, title, phone_ids_json, formats_json, status, topic_id, created_at, updated_at)
      VALUES (?, ?, ?, '["long","short"]', 'CREATED', ?, ?, ?)
    `).run(
      comparisonId,
      phoneNames.join(' vs '),
      JSON.stringify(phonesPayload),
      bestTopic.id,
      now,
      now
    );

    this.db.prepare('UPDATE topics SET status = "approved" WHERE id = ?').run(bestTopic.id);
    this.queue.enqueue('collect_specs', { comparisonId });

    return { action: 'started_comparison', reason: `Approved topic "${phoneNames.join(' vs ')}" (score ${bestTopic.score})` };
  }

  /**
   * Data Judge (Gate A Auto): verifies data completeness and confidence before rendering.
   */
  evaluateDataJudge(comparisonId: string): { passed: boolean; reasons: string[] } {
    const specs = this.db
      .prepare('SELECT category_key, confidence, raw_value FROM spec_values WHERE phone_id IN (SELECT id FROM phones WHERE id = ?) OR phone_id IS NOT NULL')
      .all() as Array<{ category_key: string; confidence: number; raw_value: string }>;

    const validSpecs = specs.filter((s) => s.confidence >= DEFAULT_AUTOPILOT_SETTINGS.minConfidence && s.raw_value);
    const presentCategories = new Set(validSpecs.map((s) => s.category_key));

    const missingRequired = DEFAULT_AUTOPILOT_SETTINGS.requiredCategories.filter((c) => !presentCategories.has(c));

    if (missingRequired.length > 0) {
      const reasons = [`Missing required categories: ${missingRequired.join(', ')}`];
      this.markSkippedLowData(comparisonId, reasons);
      return { passed: false, reasons };
    }

    if (presentCategories.size < DEFAULT_AUTOPILOT_SETTINGS.minCategories) {
      const reasons = [`Only ${presentCategories.size} categories meet confidence (required: ${DEFAULT_AUTOPILOT_SETTINGS.minCategories})`];
      this.markSkippedLowData(comparisonId, reasons);
      return { passed: false, reasons };
    }

    return { passed: true, reasons: [] };
  }

  /**
   * Video Judge (Gate B Auto): validates numbers and copy accuracy.
   */
  evaluateVideoJudge(comparisonId: string): { passed: boolean; reasons: string[] } {
    const cmp = this.db.prepare('SELECT final_json FROM comparisons WHERE id = ?').get(comparisonId) as any;
    const copy = this.db.prepare('SELECT payload_json FROM copy_assets WHERE comparison_id = ? LIMIT 1').get(comparisonId) as any;

    if (!cmp?.final_json || !copy?.payload_json) {
      return { passed: false, reasons: ['Missing final_json or copy_assets'] };
    }

    const comparisonData = JSON.parse(cmp.final_json);
    const copyData = JSON.parse(copy.payload_json);

    // Validate numbers
    const allCopyStrings = [
      ...copyData.titles,
      copyData.hook,
      copyData.description,
    ];

    const violations = validateNumbers(comparisonData, allCopyStrings);
    if (violations.length > 0) {
      const reasons = violations.map((v) => `Unverified number in copy: "${v.token}" in "${v.context}"`);
      this.recordFailure(comparisonId, reasons.join('; '));
      return { passed: false, reasons };
    }

    // Reset failure streak on success
    this.consecutiveFailures = 0;
    return { passed: true, reasons: [] };
  }

  private markSkippedLowData(comparisonId: string, reasons: string[]): void {
    this.db
      .prepare('UPDATE comparisons SET status = "SKIPPED_LOW_DATA", updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), comparisonId);
    console.warn(`[autopilot] Comparison ${comparisonId} SKIPPED_LOW_DATA:`, reasons);
  }

  private recordFailure(comparisonId: string, reason: string): void {
    this.consecutiveFailures++;
    this.db
      .prepare('UPDATE comparisons SET status = "FAILED", updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), comparisonId);

    if (this.consecutiveFailures >= DEFAULT_AUTOPILOT_SETTINGS.maxConsecutiveFailures) {
      this.isPaused = true;
      console.error(`[autopilot] SAFETY BRAKE TRIGGERED: Pausing autopilot after ${this.consecutiveFailures} consecutive failures!`);
    }
  }

  private getVideosProducedThisWeek(): number {
    const row = this.db
      .prepare(`
        SELECT count(*) as count FROM comparisons 
        WHERE status IN ('HANDED_OFF', 'PUBLISHED')
        AND created_at >= date('now', '-7 days')
      `)
      .get() as { count: number };
    return row?.count ?? 0;
  }
}
