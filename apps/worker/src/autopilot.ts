// apps/worker/src/autopilot.ts
// Autopilot Controller & Automatic Judges (Data Judge, Video Judge, Hold Window, Safety Brakes).
// Specification: docs/AUTOPILOT.md

import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { ulid } from 'ulid';
import {
  Database,
  JobQueue,
  ComparisonInput,
  DEFAULT_CATEGORY_RULES,
  validateComparison,
  validateNumbers,
  getStudioSettings,
  saveStudioSettings,
  getFreeDiskGB,
  writeAuditLog,
  setSettingValue,
  getSettingValue,
} from '@phone-studio/core';
import { checkCopyRules, CopyAllSchema } from '@phone-studio/ai';

export interface AutopilotTickResult {
  action: string;
  reason?: string;
  comparisonId?: string;
}

export interface JudgeResult {
  passed: boolean;
  reasons: string[];
  excludedCategories?: string[];
}

interface PhoneRef {
  brand: string;
  model: string;
  variant?: string;
}

function parsePhoneRefs(rawJson: string): PhoneRef[] {
  try {
    const arr = JSON.parse(rawJson);
    if (!Array.isArray(arr)) return [];
    return arr.map((item) => {
      if (typeof item === 'string') {
        const parts = item.trim().split(/\s+/);
        return { brand: parts[0] || '', model: parts.slice(1).join(' ') };
      }
      return {
        brand: String(item.brand || ''),
        model: String(item.model || ''),
        variant: item.variant ? String(item.variant) : undefined,
      };
    });
  } catch {
    return [];
  }
}

export class AutopilotController {
  constructor(
    private db: Database.Database,
    private queue: JobQueue,
    private dataDir: string,
    private dailyLimits: Record<string, number> = {
      'gemini-flash': 1500,
      'groq-free': 1000,
      'gemini-pro': 1500,
    }
  ) { }

  isPaused(): { paused: boolean; reason: string | null } {
    const pauseFile = join(this.dataDir, 'PAUSE');
    if (existsSync(pauseFile)) {
      return { paused: true, reason: 'data/PAUSE kill switch file is present' };
    }
    const settings = getStudioSettings(this.db);
    if (settings.autopilotPaused) {
      return { paused: true, reason: settings.autopilotPauseReason || 'Safety brake active' };
    }
    return { paused: false, reason: null };
  }

  /**
   * Main scheduler tick — runs every hour (or on demand).
   */
  async runSchedulerTick(): Promise<AutopilotTickResult> {
    const settings = getStudioSettings(this.db);
    const ap = settings.autopilot;

    if (!ap.enabled || ap.mode !== 'autopilot') {
      return { action: 'disabled', reason: `Pipeline mode is "${ap.mode}" (autopilot enabled=${ap.enabled})` };
    }

    // 1. Check kill switch (data/PAUSE file or safety brake)
    const pauseState = this.isPaused();
    if (pauseState.paused) {
      return { action: 'paused', reason: pauseState.reason ?? 'Autopilot paused' };
    }

    // 2. Check free disk space (>= 5 GB required per ARCHITECTURE.md §7)
    const freeGB = getFreeDiskGB(this.dataDir);
    if (freeGB !== null && freeGB < 5) {
      this.tripSafetyBrake(`Low disk space (${freeGB} GB free, minimum 5 GB required)`);
      return { action: 'paused', reason: `Low disk space (${freeGB} GB free)` };
    }

    // 3. Check LLM quota above dailyLlmReserve (AUTOPILOT.md §3 & §7)
    if (!this.hasLlmQuotaAboveReserve(ap.dailyLlmReserve)) {
      return { action: 'quota_wait', reason: 'All LLM providers are within daily reserve threshold' };
    }

    // 4. Check weekly target
    const currentWeekCount = this.getVideosProducedThisWeek();
    if (currentWeekCount >= ap.videosPerWeek) {
      return {
        action: 'idle',
        reason: `Weekly quota fulfilled (${currentWeekCount}/${ap.videosPerWeek})`,
      };
    }

    // 5. One comparison at a time
    const activeComp = this.db
      .prepare(
        `SELECT id, status FROM comparisons
         WHERE status NOT IN ('HANDED_OFF', 'PUBLISHED', 'FAILED', 'FAILED_QA', 'SKIPPED_LOW_DATA', 'CANCELLED')
         LIMIT 1`
      )
      .get() as { id: string; status: string } | undefined;

    if (activeComp) {
      return {
        action: 'active_comparison',
        reason: `Comparison ${activeComp.id} currently in progress (${activeComp.status})`,
        comparisonId: activeComp.id,
      };
    }

    // 6. Select best proposed topic >= topicScoreMin (Gate 0 Auto)
    const bestTopic = this.db
      .prepare(
        `SELECT id, phone_ids_json, score
         FROM topics
         WHERE status = 'proposed' AND score >= ?
         ORDER BY score DESC, created_at ASC
         LIMIT 1`
      )
      .get(ap.topicScoreMin) as { id: string; phone_ids_json: string; score: number } | undefined;

    if (!bestTopic) {
      // Avoid duplicate queued find_topics jobs
      const pendingFind = this.db
        .prepare("SELECT id FROM jobs WHERE type = 'find_topics' AND state IN ('queued', 'running') LIMIT 1")
        .get();
      if (!pendingFind) {
        this.queue.enqueue('find_topics');
      }
      return { action: 'enqueued_find_topics', reason: 'No proposed topics >= score threshold' };
    }

    // 7. Auto Gate 0 Approval: Create comparison and enqueue collect_specs
    const comparisonId = ulid();
    const now = new Date().toISOString();
    const phoneNames: string[] = JSON.parse(bestTopic.phone_ids_json);
    const phonesPayload = phoneNames.map((name) => {
      const parts = name.trim().split(/\s+/);
      return { brand: parts[0], model: parts.slice(1).join(' ') };
    });

    this.db
      .prepare(
        `INSERT INTO comparisons (id, title, phone_ids_json, formats_json, theme_version, status, topic_id, created_at, updated_at)
         VALUES (?, ?, ?, '["long","short"]', ?, 'CREATED', ?, ?, ?)`
      )
      .run(
        comparisonId,
        phoneNames.join(' vs '),
        JSON.stringify(phonesPayload),
        ap.defaultTemplate,
        bestTopic.id,
        now,
        now
      );

    this.db.prepare("UPDATE topics SET status = 'approved' WHERE id = ?").run(bestTopic.id);
    this.queue.enqueue('collect_specs', { comparisonId });
    writeAuditLog(this.db, 'autopilot', 'auto_approve_gate_0', comparisonId, {
      topicId: bestTopic.id,
      score: bestTopic.score,
    });

    return {
      action: 'started_comparison',
      reason: `Auto-approved topic "${phoneNames.join(' vs ')}" (score ${bestTopic.score})`,
      comparisonId,
    };
  }

  /**
   * Data Judge (Gate A Auto): inspects ONLY phones belonging to this comparison.
   * Excludes low-confidence/conflicting categories automatically; skips comparison if below floor.
   */
  evaluateDataJudge(comparisonId: string): JudgeResult {
    const settings = getStudioSettings(this.db);
    const ap = settings.autopilot;

    const cmp = this.db
      .prepare('SELECT phone_ids_json, topic_id FROM comparisons WHERE id = ?')
      .get(comparisonId) as { phone_ids_json: string; topic_id: string | null } | undefined;

    if (!cmp) {
      return { passed: false, reasons: [`Comparison ${comparisonId} not found`] };
    }

    const refs = parsePhoneRefs(cmp.phone_ids_json);
    const phoneIds: string[] = [];
    for (const ref of refs) {
      const row = this.db
        .prepare(
          `SELECT id FROM phones
           WHERE LOWER(brand) = LOWER(?) AND LOWER(model) = LOWER(?)
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(ref.brand, ref.model) as { id: string } | undefined;
      if (row) phoneIds.push(row.id);
    }

    if (phoneIds.length < 2) {
      const reasons = [`Only ${phoneIds.length} phone(s) collected (need at least 2)`];
      this.markSkippedLowData(comparisonId, cmp.topic_id, reasons);
      return { passed: false, reasons };
    }

    const manuallyExcluded = new Set<string>(
      getSettingValue<string[]>(this.db, `excluded_categories:${comparisonId}`) ?? []
    );

    const validCategories: string[] = [];
    const autoExcluded: string[] = Array.from(manuallyExcluded);
    const reasons: string[] = [];

    for (const catKey of Object.keys(DEFAULT_CATEGORY_RULES)) {
      if (manuallyExcluded.has(catKey)) continue;

      const rows = phoneIds.map((pid) =>
        this.db
          .prepare(
            `SELECT raw_value, confidence, conflict, source_kind
             FROM spec_values
             WHERE phone_id = ? AND category_key = ?`
          )
          .get(pid, catKey) as
        | { raw_value: string | null; confidence: number | null; conflict: number | null; source_kind: string | null }
        | undefined
      );

      const allPresentAndConfident = rows.every(
        (r) =>
          r !== undefined &&
          r.raw_value !== null &&
          r.raw_value.trim().length > 0 &&
          (r.confidence ?? 0) >= ap.minConfidence &&
          (r.conflict ?? 0) === 0
      );

      if (allPresentAndConfident) {
        validCategories.push(catKey);
      } else {
        autoExcluded.push(catKey);
      }
    }

    // Check required categories
    const validSet = new Set(validCategories);
    const missingRequired = ap.requiredCategories.filter((c) => !validSet.has(c));
    if (missingRequired.length > 0) {
      reasons.push(`Missing/low-confidence required categories: ${missingRequired.join(', ')}`);
    }

    // Check minimum categories count
    if (validCategories.length < ap.minCategories) {
      reasons.push(
        `Only ${validCategories.length} categories meet confidence >= ${ap.minConfidence} (required: ${ap.minCategories})`
      );
    }

    if (reasons.length > 0) {
      this.markSkippedLowData(comparisonId, cmp.topic_id, reasons);
      return { passed: false, reasons };
    }

    // Persist auto-excluded weak categories so compute_verdict skips them deterministically
    setSettingValue(this.db, `excluded_categories:${comparisonId}`, Array.from(new Set(autoExcluded)));
    writeAuditLog(this.db, 'autopilot', 'data_judge_passed', comparisonId, {
      validCategoryCount: validCategories.length,
      excludedCategories: autoExcluded,
    });

    return { passed: true, reasons: [], excludedCategories: autoExcluded };
  }

  /**
   * Video Judge (Gate B Auto): validates comparison contract, numbers, copy rules, image licenses, and rendered files.
   */
  evaluateVideoJudge(comparisonId: string): JudgeResult {
    const cmp = this.db
      .prepare('SELECT final_json, formats_json FROM comparisons WHERE id = ?')
      .get(comparisonId) as { final_json: string | null; formats_json: string } | undefined;

    const copy = this.db
      .prepare('SELECT payload_json FROM copy_assets WHERE comparison_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(comparisonId) as { payload_json: string } | undefined;

    if (!cmp?.final_json || !copy?.payload_json) {
      const reasons = ['Missing final_json or copy_assets'];
      this.markFailedQA(comparisonId, reasons);
      return { passed: false, reasons };
    }

    const comparisonData = JSON.parse(cmp.final_json) as ComparisonInput;
    const copyData = JSON.parse(copy.payload_json);
    const reasons: string[] = [];

    // 1. Validate comparison contract (includes image license check)
    const compErrors = validateComparison(comparisonData);
    for (const e of compErrors) {
      reasons.push(`Comparison contract error: ${e}`);
    }

    // 2. Validate numbers in copy (Hard Rule #3)
    const introParagraph = String(copyData.description || '').split('\n\n')[0] || '';
    const textsToCheck = [
      ...(Array.isArray(copyData.titles) ? copyData.titles : []),
      String(copyData.hook || ''),
      introParagraph,
    ].filter(Boolean);

    const violations = validateNumbers(comparisonData, textsToCheck);
    for (const v of violations) {
      reasons.push(`Unverified number in copy: "${v.token}" in "${v.context}"`);
    }

    // 3. Validate copy rules (length & banned words)
    const parsedCopy = CopyAllSchema.safeParse(copyData);
    if (parsedCopy.success) {
      for (const issue of checkCopyRules(parsedCopy.data)) {
        reasons.push(issue);
      }
    }

    // 4. Verify preview render files exist on disk and are non-empty
    const expectedFormats: string[] = JSON.parse(cmp.formats_json || '["long","short"]');
    for (const fmt of expectedFormats) {
      const renderRow = this.db
        .prepare(
          `SELECT file_path FROM renders
           WHERE comparison_id = ? AND format = ? AND stage = 'preview' AND status = 'ok'
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(comparisonId, fmt) as { file_path: string } | undefined;

      if (!renderRow?.file_path || !existsSync(renderRow.file_path)) {
        reasons.push(`Missing rendered preview file for format "${fmt}"`);
      } else if (statSync(renderRow.file_path).size === 0) {
        reasons.push(`Rendered preview file for format "${fmt}" is 0 bytes`);
      }
    }

    if (reasons.length > 0) {
      this.markFailedQA(comparisonId, reasons);
      return { passed: false, reasons };
    }

    // Reset failure streak on pass
    saveStudioSettings(this.db, { consecutiveFailures: 0 });
    writeAuditLog(this.db, 'autopilot', 'video_judge_passed', comparisonId);
    return { passed: true, reasons: [] };
  }

  /**
   * Schedules handoff respecting holdHours cancel window (AUTOPILOT.md §6).
   */
  scheduleHoldOrHandoff(comparisonId: string): { jobId: string; runAfter: string | null } {
    const settings = getStudioSettings(this.db);
    const holdHours = settings.autopilot.holdHours;
    const runAfterDate = holdHours > 0 ? new Date(Date.now() + holdHours * 3600 * 1000) : undefined;

    const jobId = this.queue.enqueue('handoff', {
      comparisonId,
      runAfter: runAfterDate,
      payload: {
        visibility: holdHours > 0 ? 'private' : 'public',
        holdHours,
      },
    });

    this.db
      .prepare(`UPDATE comparisons SET status = 'METADATA_READY', updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), comparisonId);

    writeAuditLog(this.db, 'autopilot', 'schedule_handoff', comparisonId, {
      holdHours,
      runAfter: runAfterDate?.toISOString() ?? 'immediate',
      jobId,
    });

    return { jobId, runAfter: runAfterDate?.toISOString() ?? null };
  }

  private markSkippedLowData(comparisonId: string, topicId: string | null, reasons: string[]): void {
    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE comparisons SET status = 'SKIPPED_LOW_DATA', failed_stage = 'gate_a_data_judge', updated_at = ? WHERE id = ?`)
      .run(now, comparisonId);

    if (topicId) {
      this.db.prepare("UPDATE topics SET status = 'rejected' WHERE id = ?").run(topicId);
    }

    writeAuditLog(this.db, 'autopilot', 'data_judge_skipped', comparisonId, { reasons });
    this.incrementFailureStreak(`Data Judge skipped ${comparisonId}: ${reasons.join('; ')}`);
  }

  private markFailedQA(comparisonId: string, reasons: string[]): void {
    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE comparisons SET status = 'FAILED_QA', failed_stage = 'gate_b_video_judge', updated_at = ? WHERE id = ?`)
      .run(now, comparisonId);

    writeAuditLog(this.db, 'autopilot', 'video_judge_failed', comparisonId, { reasons });
    this.incrementFailureStreak(`Video Judge failed QA on ${comparisonId}: ${reasons.join('; ')}`);
  }

  private incrementFailureStreak(reason: string): void {
    const settings = getStudioSettings(this.db);
    const nextFailures = settings.consecutiveFailures + 1;

    if (nextFailures >= settings.autopilot.maxConsecutiveFailures) {
      this.tripSafetyBrake(`Paused after ${nextFailures} consecutive QA/data failures (${reason})`, nextFailures);
    } else {
      saveStudioSettings(this.db, { consecutiveFailures: nextFailures });
    }
  }

  private tripSafetyBrake(reason: string, failures?: number): void {
    saveStudioSettings(this.db, {
      autopilotPaused: true,
      autopilotPauseReason: reason,
      ...(failures !== undefined ? { consecutiveFailures: failures } : {}),
    });
    writeAuditLog(this.db, 'autopilot', 'safety_brake_triggered', 'autopilot', { reason });
    console.error(`[autopilot] SAFETY BRAKE TRIGGERED: ${reason}`);
  }

  private hasLlmQuotaAboveReserve(reserveFraction: number): boolean {
    const today = new Date().toISOString().slice(0, 10);
    const rows = this.db
      .prepare('SELECT provider, count FROM llm_usage WHERE day = ?')
      .all(today) as Array<{ provider: string; count: number }>;

    const usageMap = new Map(rows.map((r) => [r.provider, r.count]));
    for (const [provider, limit] of Object.entries(this.dailyLimits)) {
      const used = usageMap.get(provider) ?? 0;
      const maxAllowed = Math.floor(limit * (1 - reserveFraction));
      if (used < maxAllowed) {
        return true;
      }
    }
    return false;
  }

  private getVideosProducedThisWeek(): number {
    const row = this.db
      .prepare(
        `SELECT count(*) as count FROM comparisons
         WHERE status IN ('HANDED_OFF', 'PUBLISHED')
           AND created_at >= date('now', '-7 days')`
      )
      .get() as { count: number };
    return row?.count ?? 0;
  }
}
