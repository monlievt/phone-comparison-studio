// apps/worker/src/telegram.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Database, migrate, JobQueue, saveStudioSettings } from '@phone-studio/core';
import { TelegramBotService } from './telegram.js';
import { AutopilotController } from './autopilot.js';

function createDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

describe('TelegramBotService', () => {
  let db: Database.Database;
  let queue: JobQueue;
  let tempDir: string;
  let fetchCalls: Array<{ url: string; body: unknown }>;
  let bot: TelegramBotService;

  beforeEach(() => {
    db = createDb();
    queue = new JobQueue(db);
    tempDir = mkdtempSync(join(tmpdir(), 'phone-studio-tg-'));
    fetchCalls = [];

    const mockFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      let parsedBody: unknown = init?.body;
      if (typeof init?.body === 'string') {
        try {
          parsedBody = JSON.parse(init.body);
        } catch {
          parsedBody = init.body;
        }
      }
      fetchCalls.push({ url, body: parsedBody });
      return new Response(JSON.stringify({ ok: true, result: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    bot = new TelegramBotService({
      botToken: 'test-token',
      chatId: '999001',
      appBaseUrl: 'http://100.64.0.10:3000',
      db,
      queue,
      dataDir: tempDir,
      fetchImpl: mockFetch,
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    db.close();
  });

  it('ignores commands and callbacks from unauthorized chats', async () => {
    await bot.handleUpdate({
      update_id: 1,
      message: { message_id: 10, chat: { id: 123456 }, text: '/pause' },
    });
    expect(fetchCalls.length).toBe(0);
    expect(existsSync(join(tempDir, 'PAUSE'))).toBe(false);
  });

  it('reports accurate counts on /status and lists attention items on /pending', async () => {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO comparisons (id, title, phone_ids_json, formats_json, status, created_at, updated_at) VALUES
        ('c_done', 'A vs B', '[]', '["long"]', 'HANDED_OFF', ?, ?),
        ('c_wait', 'C vs D', '[]', '["long"]', 'METADATA_READY', ?, ?),
        ('c_fail', 'E vs F', '[]', '["long"]', 'FAILED_QA', ?, ?),
        ('c_skip', 'G vs H', '[]', '["long"]', 'SKIPPED_LOW_DATA', ?, ?),
        ('c_canc', 'I vs J', '[]', '["long"]', 'CANCELLED', ?, ?)
    `).run(now, now, now, now, now, now, now, now, now, now);

    await bot.handleUpdate({
      update_id: 2,
      message: { message_id: 11, chat: { id: 999001 }, text: '/status' },
    });

    const statusPayload = fetchCalls[0].body as { text: string };
    expect(statusPayload.text).toContain('Terkirim / Terupload: <b>1</b>');
    expect(statusPayload.text).toContain('Menunggu ACC/Hold): <b>1</b>');
    expect(statusPayload.text).toContain('Perlu Penanganan / Koreksi: <b>1</b>');
    expect(statusPayload.text).toContain('Di-skip Auto-Judge: <b>1</b>');
    expect(statusPayload.text).toContain('Ditolak / Dibatalkan: <b>1</b>');

    await bot.handleUpdate({
      update_id: 3,
      message: { message_id: 12, chat: { id: 999001 }, text: '/pending' },
    });

    const pendingPayload = fetchCalls[1].body as { text: string };
    expect(pendingPayload.text).toContain('C vs D');
    expect(pendingPayload.text).toContain('E vs F');
    expect(pendingPayload.text).toContain('http://100.64.0.10:3000/comparisons/c_fail');
  });

  it('handles approve, fix, recollect, and reject inline buttons cleanly', async () => {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO topics (id, phone_ids_json, score, status, created_at)
      VALUES ('t_1', '["Samsung S25","OnePlus 13"]', 85, 'approved', ?)
    `).run(now);
    db.prepare(`
      INSERT INTO comparisons (id, title, phone_ids_json, formats_json, status, topic_id, created_at, updated_at)
      VALUES ('cmp_1', 'Samsung S25 vs OnePlus 13', '[]', '["long","short"]', 'METADATA_READY', 't_1', ?, ?)
    `).run(now, now);

    // Enqueue held handoff 24h in future
    const heldJobId = queue.enqueue('handoff', {
      comparisonId: 'cmp_1',
      runAfter: new Date(Date.now() + 24 * 3600 * 1000),
    });

    // 1. Approve -> clears run_after immediately
    await bot.handleUpdate({
      update_id: 10,
      callback_query: {
        id: 'cb1',
        data: 'tg:approve:cmp_1',
        message: { message_id: 50, chat: { id: 999001 } },
      },
    });
    const afterApprove = db.prepare('SELECT run_after FROM jobs WHERE id = ?').get(heldJobId) as { run_after: string | null };
    expect(afterApprove.run_after).toBeNull();

    // 2. Fix -> deletes queued handoff and reverts comparison to COLLECTED (Gate A) with clickable URL
    await bot.handleUpdate({
      update_id: 11,
      callback_query: {
        id: 'cb2',
        data: 'tg:fix:cmp_1',
        message: { message_id: 50, chat: { id: 999001 } },
      },
    });
    const cmpFix = db.prepare('SELECT status FROM comparisons WHERE id = ?').get('cmp_1') as { status: string };
    expect(cmpFix.status).toBe('COLLECTED');
    expect(db.prepare("SELECT count(*) as c FROM jobs WHERE type = 'handoff' AND state = 'queued'").get()).toEqual({ c: 0 });
    const fixMsg = fetchCalls.find((c) => c.url.endsWith('/sendMessage') && JSON.stringify(c.body).includes('Ditahan untuk Koreksi'));
    expect(JSON.stringify(fixMsg?.body)).toContain('http://100.64.0.10:3000/comparisons/cmp_1');

    // 3. Recollect -> sets CREATED and enqueues forceRefresh collect_specs
    await bot.handleUpdate({
      update_id: 12,
      callback_query: {
        id: 'cb3',
        data: 'tg:recollect:cmp_1',
        message: { message_id: 50, chat: { id: 999001 } },
      },
    });
    const recollectJob = db.prepare("SELECT payload_json FROM jobs WHERE type = 'collect_specs' AND comparison_id = 'cmp_1'").get() as {
      payload_json: string;
    };
    expect(JSON.parse(recollectJob.payload_json)).toMatchObject({ forceRefresh: true });

    // 4. Reject -> marks comparison CANCELLED and linked topic rejected
    await bot.handleUpdate({
      update_id: 13,
      callback_query: {
        id: 'cb4',
        data: 'tg:reject:cmp_1',
        message: { message_id: 50, chat: { id: 999001 } },
      },
    });
    expect((db.prepare('SELECT status FROM comparisons WHERE id = ?').get('cmp_1') as { status: string }).status).toBe('CANCELLED');
    expect((db.prepare('SELECT status FROM topics WHERE id = ?').get('t_1') as { status: string }).status).toBe('rejected');
  });

  it('supports /pause, /resume, /run, and Strict Approval mode in AutopilotController', async () => {
    // /pause & /resume
    await bot.handleUpdate({
      update_id: 20,
      message: { message_id: 20, chat: { id: 999001 }, text: '/pause' },
    });
    expect(existsSync(join(tempDir, 'PAUSE'))).toBe(true);

    await bot.handleUpdate({
      update_id: 21,
      message: { message_id: 21, chat: { id: 999001 }, text: '/resume' },
    });
    expect(existsSync(join(tempDir, 'PAUSE'))).toBe(false);

    // /run
    await bot.handleUpdate({
      update_id: 22,
      message: { message_id: 22, chat: { id: 999001 }, text: '/run' },
    });
    expect(db.prepare("SELECT count(*) as c FROM jobs WHERE type = 'autopilot_tick' AND state = 'queued'").get()).toEqual({ c: 1 });

    // Strict Approval holds handoff without enqueuing handoff job
    saveStudioSettings(db, {
      autopilot: { enabled: true, mode: 'autopilot', requireTelegramApproval: true, holdHours: 24 },
    });
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO comparisons (id, title, phone_ids_json, formats_json, status, created_at, updated_at)
      VALUES ('cmp_strict', 'Pixel 10 vs S26', '[]', '["long","short"]', 'FINAL_RENDERED', ?, ?)
    `).run(now, now);

    const autopilot = new AutopilotController(db, queue, tempDir, undefined, bot);
    const scheduled = autopilot.scheduleHoldOrHandoff('cmp_strict');
    expect(scheduled.jobId).toBeNull();
    expect(db.prepare("SELECT count(*) as c FROM jobs WHERE type = 'handoff' AND comparison_id = 'cmp_strict'").get()).toEqual({ c: 0 });
  });
});
