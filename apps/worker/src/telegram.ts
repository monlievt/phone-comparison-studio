// apps/worker/src/telegram.ts
// Zero-dependency Telegram Bot notifications, final video review (inline buttons),
// and pocket status/control commands (/status, /pending, /run, /pause, /resume).

import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import {
  Database,
  JobQueue,
  Job,
  ComparisonInput,
  getStudioSettings,
  saveStudioSettings,
  getFreeDiskGB,
  writeAuditLog,
  getSettingValue,
  setSettingValue,
} from '@phone-studio/core';

const MAX_TELEGRAM_FILE_BYTES = 48 * 1024 * 1024; // 48 MB safety margin (Telegram Bot API cap is 50 MB)

export interface TelegramBotOptions {
  botToken: string;
  chatId: string;
  appBaseUrl?: string;
  db: Database.Database;
  queue: JobQueue;
  dataDir: string;
  dailyLimits?: Record<string, number>;
  /** Optional fetch implementation for deterministic unit tests */
  fetchImpl?: typeof fetch;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number | string };
    text?: string;
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: {
      message_id: number;
      chat: { id: number | string };
    };
  };
}

interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

function escHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export class TelegramBotService {
  private botToken: string;
  private chatId: string;
  private appBaseUrl: string;
  private db: Database.Database;
  private queue: JobQueue;
  private dataDir: string;
  private dailyLimits: Record<string, number>;
  private fetchImpl: typeof fetch;
  private polling = false;
  private lastUpdateId = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: TelegramBotOptions) {
    this.botToken = opts.botToken.trim();
    this.chatId = String(opts.chatId).trim();
    this.appBaseUrl = (opts.appBaseUrl || 'http://127.0.0.1:3000').replace(/\/+$/, '');
    this.db = opts.db;
    this.queue = opts.queue;
    this.dataDir = opts.dataDir;
    this.dailyLimits = opts.dailyLimits ?? {
      'gemini-flash': 1500,
      'groq-free': 1000,
    };
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private apiUrl(method: string): string {
    return `https://api.telegram.org/bot${this.botToken}/${method}`;
  }

  private comparisonUrl(comparisonId: string): string {
    return `${this.appBaseUrl}/comparisons/${comparisonId}`;
  }

  /**
   * Sends a safe HTML message (never throws into the video pipeline).
   */
  async sendMessage(
    text: string,
    inlineKeyboard?: InlineButton[][]
  ): Promise<boolean> {
    try {
      const payload: Record<string, unknown> = {
        chat_id: this.chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      };
      if (inlineKeyboard && inlineKeyboard.length > 0) {
        payload.reply_markup = { inline_keyboard: inlineKeyboard };
      }

      const res = await this.fetchImpl(this.apiUrl('sendMessage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn(`[telegram] sendMessage failed (HTTP ${res.status}): ${body}`);
        return false;
      }
      return true;
    } catch (err: unknown) {
      console.warn('[telegram] sendMessage error:', err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  async sendPhoto(filePath: string, caption?: string): Promise<boolean> {
    try {
      if (!existsSync(filePath)) return false;
      const bytes = readFileSync(filePath);
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_TELEGRAM_FILE_BYTES) return false;

      const form = new FormData();
      form.append('chat_id', this.chatId);
      form.append('photo', new Blob([bytes], { type: 'image/png' }), basename(filePath));
      if (caption) {
        form.append('caption', caption.slice(0, 1024));
        form.append('parse_mode', 'HTML');
      }

      const res = await this.fetchImpl(this.apiUrl('sendPhoto'), {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn(`[telegram] sendPhoto failed (HTTP ${res.status}): ${body}`);
        return false;
      }
      return true;
    } catch (err: unknown) {
      console.warn('[telegram] sendPhoto error:', err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  async sendVideo(filePath: string, caption?: string): Promise<{ sent: boolean; skippedTooLarge?: boolean }> {
    try {
      if (!existsSync(filePath)) return { sent: false };
      const size = statSync(filePath).size;
      if (size === 0) return { sent: false };
      if (size > MAX_TELEGRAM_FILE_BYTES) {
        return { sent: false, skippedTooLarge: true };
      }

      const bytes = readFileSync(filePath);
      const form = new FormData();
      form.append('chat_id', this.chatId);
      form.append('video', new Blob([bytes], { type: 'video/mp4' }), basename(filePath));
      form.append('supports_streaming', 'true');
      if (caption) {
        form.append('caption', caption.slice(0, 1024));
        form.append('parse_mode', 'HTML');
      }

      const res = await this.fetchImpl(this.apiUrl('sendVideo'), {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn(`[telegram] sendVideo failed (HTTP ${res.status}): ${body}`);
        return { sent: false };
      }
      return { sent: true };
    } catch (err: unknown) {
      console.warn('[telegram] sendVideo error:', err instanceof Error ? err.message : String(err));
      return { sent: false };
    }
  }

  private async answerCallbackQuery(callbackQueryId: string, text: string): Promise<void> {
    try {
      await this.fetchImpl(this.apiUrl('answerCallbackQuery'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQueryId, text: text.slice(0, 200) }),
      });
    } catch {
      // non-fatal
    }
  }

  /**
   * Sends Thumbnail + Short/Long video previews + key spec summary + 4 decision buttons.
   */
  async notifyFinalReview(
    comparisonId: string,
    opts: { holdHours: number; strictApproval: boolean; runAfter?: string | null }
  ): Promise<void> {
    const cmp = this.db
      .prepare('SELECT id, title, final_json FROM comparisons WHERE id = ?')
      .get(comparisonId) as { id: string; title: string | null; final_json: string | null } | undefined;

    if (!cmp) return;

    const renders = this.db
      .prepare(
        `SELECT format, file_path FROM renders
         WHERE comparison_id = ? AND stage = 'final' AND status = 'ok'`
      )
      .all(comparisonId) as Array<{ format: string; file_path: string }>;

    const thumbPath = renders.find((r) => r.format === 'thumbnail')?.file_path;
    const shortPath = renders.find((r) => r.format === 'short')?.file_path;
    const longPath = renders.find((r) => r.format === 'long')?.file_path;

    let title = cmp.title || comparisonId;
    let specSummaryLines: string[] = [];
    let categoryCount = 0;

    if (cmp.final_json) {
      try {
        const data = JSON.parse(cmp.final_json) as ComparisonInput;
        title = data.phones.map((p) => p.name).join(' vs ');
        categoryCount = data.categories.length;

        // Compute quick points per phone from deterministic rankings
        const pts = data.phones.map(() => 0);
        for (const cat of data.categories) {
          const w = cat.weight ?? 1;
          cat.ranking.forEach((rank, idx) => {
            if (rank === 1) pts[idx] += 3 * w;
            else if (rank === 2) pts[idx] += 2 * w;
            else if (rank === 3) pts[idx] += 1 * w;
          });
        }

        const chipsetCat = data.categories.find((c) => c.key === 'chipset');
        const batteryCat = data.categories.find((c) => c.key === 'battery');

        specSummaryLines = data.phones.map((p, idx) => {
          const priceTxt = p.priceUSD != null ? `$${p.priceUSD}` : 'N/A';
          const socTxt = chipsetCat?.values[idx]?.primary ?? p.soc ?? 'N/A';
          const batTxt = batteryCat?.values[idx]?.primary ?? 'N/A';
          return `• <b>${escHtml(p.name)}</b> (${Math.round(pts[idx])} pts)\n  Harga: ${escHtml(priceTxt)} | SoC: ${escHtml(socTxt)} | Baterai: ${escHtml(batTxt)}`;
        });
      } catch {
        // fall back to basic title
      }
    }

    // 1. Send thumbnail if present
    if (thumbPath && existsSync(thumbPath)) {
      await this.sendPhoto(thumbPath, `<b>Thumbnail:</b> ${escHtml(title)}`);
    }

    // 2. Send Short 9:16 video (~13 MB)
    if (shortPath && existsSync(shortPath)) {
      const s = statSync(shortPath);
      await this.sendVideo(shortPath, `<b>Short 9:16</b> (${formatMB(s.size)}): ${escHtml(title)}`);
    }

    // 3. Send Long 16:9 video if <= 48 MB
    let longSkippedNote = '';
    if (longPath && existsSync(longPath)) {
      const s = statSync(longPath);
      const res = await this.sendVideo(longPath, `<b>Long 16:9</b> (${formatMB(s.size)}): ${escHtml(title)}`);
      if (res.skippedTooLarge) {
        longSkippedNote = `\n<i>Video Long (${formatMB(s.size)}) melebihi batas 50 MB Telegram. Tonton di dashboard web.</i>`;
      }
    }

    const modeNote = opts.strictApproval
      ? '🔒 <b>Mode Wajib ACC:</b> Tidak akan dikirim ke ytagent sebelum Anda klik <b>OK</b>.'
      : opts.holdHours > 0
      ? `⏳ <b>Hold Window (${opts.holdHours} jam):</b> Akan otomatis dikirim ke ytagent jika tidak dibatalkan.`
      : '⚡ <b>Kirim Instan:</b> Dijadwalkan langsung masuk ke ytagent.';

    const messageText = [
      `🎬 <b>Video Final Siap Review</b>`,
      `<b>${escHtml(title)}</b> (${categoryCount} kategori)`,
      '',
      ...specSummaryLines,
      longSkippedNote,
      '',
      modeNote,
      `🔗 Web: ${escHtml(this.comparisonUrl(comparisonId))}`,
    ]
      .filter((line) => line !== undefined)
      .join('\n');

    await this.sendMessage(messageText, [
      [
        { text: '✅ OK — Kirim Sekarang', callback_data: `tg:approve:${comparisonId}` },
        { text: '🔧 Koreksi di Web', callback_data: `tg:fix:${comparisonId}` },
      ],
      [
        { text: '🔄 Ambil Ulang Spek', callback_data: `tg:recollect:${comparisonId}` },
        { text: '❌ Tolak & Skip', callback_data: `tg:reject:${comparisonId}` },
      ],
    ]);
  }

  async notifyHandoffSuccess(
    comparisonId: string,
    results: Array<{ format: string; ref: string; status: string; channelName?: string }>
  ): Promise<void> {
    const cmp = this.db
      .prepare('SELECT title FROM comparisons WHERE id = ?')
      .get(comparisonId) as { title: string | null } | undefined;
    const title = cmp?.title || comparisonId;
    const lines = results.map(
      (r) => `• ${r.format.toUpperCase()}: <code>${escHtml(r.ref)}</code> (${escHtml(r.status)})`
    );
    const channel = results[0]?.channelName ? `\nChannel: <b>${escHtml(results[0].channelName)}</b>` : '';

    await this.sendMessage(
      `✅ <b>Handoff ke ytagent Berhasil</b>\n<b>${escHtml(title)}</b>${channel}\n${lines.join('\n')}`
    );
  }

  async notifyAutoJudgeSkip(comparisonId: string, stage: 'data_judge' | 'video_judge', reasons: string[]): Promise<void> {
    const cmp = this.db
      .prepare('SELECT title FROM comparisons WHERE id = ?')
      .get(comparisonId) as { title: string | null } | undefined;
    const title = cmp?.title || comparisonId;
    const label = stage === 'data_judge' ? 'Data Judge (SKIPPED_LOW_DATA)' : 'Video Judge (FAILED_QA)';

    await this.sendMessage(
      `⚠️ <b>Topik Di-skip: ${label}</b>\n<b>${escHtml(title)}</b>\nAlasan:\n${reasons.slice(0, 4).map((r) => `• ${escHtml(r)}`).join('\n')}\n🔗 ${escHtml(this.comparisonUrl(comparisonId))}`
    );
  }

  async notifySafetyBrake(reason: string): Promise<void> {
    const freeGB = getFreeDiskGB(this.dataDir);
    const diskLine = freeGB !== null ? `\nSisa SSD: <b>${freeGB} GB</b>` : '';
    await this.sendMessage(
      `🚨 <b>AUTOPILOT DIHENTIKAN (Safety Brake)</b>\nAlasan: ${escHtml(reason)}${diskLine}\n\nKetik /resume jika masalah sudah beres, atau buka ${escHtml(this.appBaseUrl)}/settings`
    );
  }

  async notifyJobFailure(job: Job, errorMsg: string): Promise<void> {
    let label: string = job.type;
    if (job.comparison_id) {
      const cmp = this.db
        .prepare('SELECT title FROM comparisons WHERE id = ?')
        .get(job.comparison_id) as { title: string | null } | undefined;
      if (cmp?.title) {
        label = `${job.type} (${cmp.title})`;
      }
    }
    const link = job.comparison_id ? `\n🔗 ${escHtml(this.comparisonUrl(job.comparison_id))}` : '';
    await this.sendMessage(
      `❌ <b>Job Gagal / Blocked</b>\nTask: <b>${escHtml(label)}</b>\nError: <code>${escHtml(errorMsg.slice(0, 300))}</code>${link}`
    );
  }

  /**
   * Builds a concise live pipeline report from SQLite for /status and scheduled digests.
   */
  formatStatusReport(heading = '📊 Status PhoneStudio'): string {
    const settings = getStudioSettings(this.db);
    const pauseFileExists = existsSync(join(this.dataDir, 'PAUSE'));
    const isPaused = pauseFileExists || settings.autopilotPaused;
    const freeGB = getFreeDiskGB(this.dataDir);
    const today = new Date().toISOString().slice(0, 10);

    const modeLabel = isPaused
      ? `PAUSED (${settings.autopilotPauseReason || 'PAUSE file active'})`
      : settings.autopilot.mode === 'autopilot' && settings.autopilot.enabled
      ? 'Autopilot AKTIF'
      : 'Manual Gate Mode';

    const weekDone = (
      this.db
        .prepare(
          `SELECT count(*) as c FROM comparisons
           WHERE status IN ('HANDED_OFF', 'PUBLISHED') AND created_at >= date('now', '-7 days')`
        )
        .get() as { c: number }
    ).c;

    const statusRows = this.db
      .prepare('SELECT status, count(*) as c FROM comparisons GROUP BY status')
      .all() as Array<{ status: string; c: number }>;
    const counts = new Map(statusRows.map((r) => [r.status, r.c]));
    const sumOf = (...statuses: string[]) => statuses.reduce((acc, s) => acc + (counts.get(s) ?? 0), 0);

    const uploaded = sumOf('HANDED_OFF', 'PUBLISHED');
    const waitingAcc = sumOf('FINAL_RENDERED', 'METADATA_READY');
    const inProgress = sumOf('CREATED', 'DATA_APPROVED', 'COPY_READY', 'PREVIEW_RENDERED', 'VIDEO_APPROVED');
    const needsAttention = sumOf('COLLECTED', 'GATE_A', 'GATE_B', 'FAILED', 'FAILED_QA');
    const skippedLowData = sumOf('SKIPPED_LOW_DATA');
    const cancelled = sumOf('CANCELLED');

    const proposedTopics = (
      this.db.prepare("SELECT count(*) as c FROM topics WHERE status = 'proposed'").get() as { c: number }
    ).c;

    const failedJobs = (
      this.db.prepare("SELECT count(*) as c FROM jobs WHERE state IN ('failed', 'blocked')").get() as { c: number }
    ).c;

    const llmRows = this.db
      .prepare('SELECT provider, count FROM llm_usage WHERE day = ?')
      .all(today) as Array<{ provider: string; count: number }>;
    const geminiUsed = llmRows.filter((r) => r.provider.includes('gemini')).reduce((s, r) => s + r.count, 0);
    const groqUsed = llmRows.filter((r) => r.provider.includes('groq')).reduce((s, r) => s + r.count, 0);
    const geminiLimit = this.dailyLimits['gemini-flash'] ?? 1500;
    const groqLimit = this.dailyLimits['groq-free'] ?? 1000;

    return [
      `<b>${escHtml(heading)}</b>`,
      `Mode: <b>${escHtml(modeLabel)}</b>`,
      `Target Minggu Ini: <b>${weekDone} / ${settings.autopilot.videosPerWeek} video</b>`,
      `Sisa Disk SSD: <b>${freeGB !== null ? `${freeGB} GB` : 'N/A'}</b>`,
      '',
      '<b>Rekap Video:</b>',
      `✅ Terkirim / Terupload: <b>${uploaded}</b>`,
      `🎬 Selesai Render (Menunggu ACC/Hold): <b>${waitingAcc}</b>`,
      `⚙️ Sedang Diproses: <b>${inProgress}</b>`,
      `🔧 Perlu Penanganan / Koreksi: <b>${needsAttention}</b>`,
      `⚠️ Di-skip Auto-Judge: <b>${skippedLowData}</b>`,
      `❌ Ditolak / Dibatalkan: <b>${cancelled}</b>`,
      '',
      `📌 Topik Gate 0 siap pakai: <b>${proposedTopics}</b>`,
      `🧩 Job gagal/blocked: <b>${failedJobs}</b>`,
      `🤖 Kuota LLM hari ini: Gemini <b>${geminiUsed}/${geminiLimit}</b> | Groq <b>${groqUsed}/${groqLimit}</b>`,
      '',
      `Perintah: /status · /pending · /run · /pause · /resume`,
    ].join('\n');
  }

  formatPendingReport(): string {
    const rows = this.db
      .prepare(
        `SELECT id, title, status, updated_at FROM comparisons
         WHERE status IN ('FINAL_RENDERED', 'METADATA_READY', 'COLLECTED', 'GATE_A', 'GATE_B', 'FAILED', 'FAILED_QA')
         ORDER BY updated_at DESC
         LIMIT 6`
      )
      .all() as Array<{ id: string; title: string | null; status: string; updated_at: string }>;

    if (rows.length === 0) {
      return '✨ <b>Tidak ada video yang menunggu ACC atau perlu penanganan.</b>';
    }

    const lines = rows.map(
      (r) =>
        `• <b>${escHtml(r.title || r.id)}</b> [<code>${escHtml(r.status)}</code>]\n  ${escHtml(this.comparisonUrl(r.id))}`
    );

    return `📋 <b>Perlu Penanganan / Menunggu ACC (${rows.length})</b>\n\n${lines.join('\n\n')}`;
  }

  /**
   * Sends scheduled daily or weekly digest if due (deduped via SQLite settings).
   */
  async maybeSendScheduledDigest(now = new Date()): Promise<boolean> {
    const settings = getStudioSettings(this.db);
    const freq = settings.autopilot.telegramDigest;
    if (freq === 'off') return false;

    const todayKey = now.toISOString().slice(0, 10);
    const lastSent = getSettingValue<string>(this.db, 'telegram_last_digest_day');
    if (lastSent === todayKey) return false;

    // Weekly digest sends on Sunday (getDay() === 0) around >= 19:00 local time; daily sends >= 20:00
    const hour = now.getHours();
    if (freq === 'weekly' && (now.getDay() !== 0 || hour < 19)) {
      return false;
    }
    if (freq === 'daily' && hour < 20) {
      return false;
    }

    const heading = freq === 'daily' ? '📊 Laporan Harian PhoneStudio' : '📊 Laporan Mingguan PhoneStudio';
    const sent = await this.sendMessage(this.formatStatusReport(heading));
    if (sent) {
      setSettingValue(this.db, 'telegram_last_digest_day', todayKey);
    }
    return sent;
  }

  /**
   * Processes one Telegram update (exported for unit tests).
   */
  async handleUpdate(update: TelegramUpdate): Promise<void> {
    // 1. Handle inline button callbacks
    if (update.callback_query) {
      const cb = update.callback_query;
      const incomingChatId = cb.message?.chat?.id;
      if (incomingChatId === undefined || String(incomingChatId) !== this.chatId) {
        return; // Strictly ignore unauthorized chats
      }
      await this.handleCallbackData(cb.id, cb.data || '');
      return;
    }

    // 2. Handle text commands
    if (update.message?.text) {
      const incomingChatId = update.message.chat.id;
      if (String(incomingChatId) !== this.chatId) {
        return; // Strictly ignore unauthorized chats
      }
      const cmd = update.message.text.trim().split(/\s+/)[0].split('@')[0].toLowerCase();
      await this.handleCommand(cmd);
    }
  }

  private async handleCommand(cmd: string): Promise<void> {
    switch (cmd) {
      case '/status':
        await this.sendMessage(this.formatStatusReport());
        break;
      case '/pending':
        await this.sendMessage(this.formatPendingReport());
        break;
      case '/run': {
        const existing = this.db
          .prepare("SELECT id FROM jobs WHERE type = 'autopilot_tick' AND state IN ('queued', 'running') LIMIT 1")
          .get() as { id: string } | undefined;
        const jobId = existing ? existing.id : this.queue.enqueue('autopilot_tick');
        writeAuditLog(this.db, 'telegram', 'autopilot_run_now', jobId);
        await this.sendMessage(
          existing
            ? '⚙️ Siklus Autopilot sudah ada di antrean.'
            : '🚀 Siklus Autopilot dijadwalkan sekarang (diproses worker dalam ~2 detik).'
        );
        break;
      }
      case '/pause': {
        const pausePath = join(this.dataDir, 'PAUSE');
        writeFileSync(pausePath, `Paused via Telegram at ${new Date().toISOString()}\n`, 'utf-8');
        saveStudioSettings(this.db, {
          autopilotPaused: true,
          autopilotPauseReason: 'Paused via Telegram /pause',
        });
        writeAuditLog(this.db, 'telegram', 'autopilot_pause', 'PAUSE');
        await this.sendMessage('⏸️ <b>Autopilot dijeda</b> (<code>data/PAUSE</code> dibuat). Ketik /resume untuk melanjutkan.');
        break;
      }
      case '/resume': {
        const pausePath = join(this.dataDir, 'PAUSE');
        if (existsSync(pausePath)) {
          unlinkSync(pausePath);
        }
        saveStudioSettings(this.db, {
          autopilotPaused: false,
          autopilotPauseReason: null,
          consecutiveFailures: 0,
        });
        writeAuditLog(this.db, 'telegram', 'autopilot_resume', 'PAUSE');
        await this.sendMessage('▶️ <b>Autopilot dilanjutkan</b> dan hitungan gagal di-reset.');
        break;
      }
      case '/start':
      case '/help':
        await this.sendMessage(
          [
            '<b>PhoneStudio Bot Commands</b>',
            '/status — Rekap video, disk, dan kuota LLM',
            '/pending — Daftar video menunggu ACC / perlu koreksi',
            '/run — Jalankan 1 siklus Autopilot sekarang',
            '/pause — Jeda Autopilot (kill switch)',
            '/resume — Lanjutkan Autopilot & reset brake',
          ].join('\n')
        );
        break;
      default:
        break;
    }
  }

  private async handleCallbackData(callbackQueryId: string, data: string): Promise<void> {
    const parts = data.split(':');
    if (parts.length !== 3 || parts[0] !== 'tg') return;
    const [, action, comparisonId] = parts;
    const now = new Date().toISOString();

    const cmp = this.db
      .prepare('SELECT id, title, topic_id FROM comparisons WHERE id = ?')
      .get(comparisonId) as { id: string; title: string | null; topic_id: string | null } | undefined;

    if (!cmp) {
      await this.answerCallbackQuery(callbackQueryId, 'Comparison tidak ditemukan.');
      return;
    }

    const title = cmp.title || comparisonId;

    if (action === 'approve') {
      const queuedHandoff = this.db
        .prepare("SELECT id FROM jobs WHERE comparison_id = ? AND type = 'handoff' AND state = 'queued' LIMIT 1")
        .get(comparisonId) as { id: string } | undefined;

      if (queuedHandoff) {
        // Accelerate held handoff to run immediately
        this.db
          .prepare('UPDATE jobs SET run_after = NULL, updated_at = ? WHERE id = ?')
          .run(now, queuedHandoff.id);
      } else {
        this.queue.enqueue('handoff', {
          comparisonId,
          payload: { visibility: 'private', approvedVia: 'telegram' },
        });
      }
      writeAuditLog(this.db, 'telegram', 'telegram_approve_handoff', comparisonId);
      await this.answerCallbackQuery(callbackQueryId, 'Disetujui! Handoff dimulai.');
      await this.sendMessage(`✅ <b>Disetujui:</b> ${escHtml(title)}\nVideo segera dikirim ke ytagent (~2 detik).`);
      return;
    }

    if (action === 'fix') {
      // Cancel pending handoff so video will NOT auto-upload; return to Gate A (COLLECTED)
      this.db
        .prepare("DELETE FROM jobs WHERE comparison_id = ? AND type = 'handoff' AND state = 'queued'")
        .run(comparisonId);
      this.db
        .prepare("UPDATE comparisons SET status = 'COLLECTED', updated_at = ? WHERE id = ?")
        .run(now, comparisonId);
      writeAuditLog(this.db, 'telegram', 'telegram_hold_for_fix', comparisonId);
      await this.answerCallbackQuery(callbackQueryId, 'Ditahan untuk koreksi di web.');
      await this.sendMessage(
        `🔧 <b>Ditahan untuk Koreksi:</b> ${escHtml(title)}\nHandoff dibatalkan dan status dikembalikan ke Gate A (COLLECTED).\n\nBuka link ini untuk edit spek/copy lalu render ulang:\n${escHtml(this.comparisonUrl(comparisonId))}`
      );
      return;
    }

    if (action === 'recollect') {
      this.db
        .prepare("DELETE FROM jobs WHERE comparison_id = ? AND type = 'handoff' AND state = 'queued'")
        .run(comparisonId);
      this.db
        .prepare("UPDATE comparisons SET status = 'CREATED', updated_at = ? WHERE id = ?")
        .run(now, comparisonId);
      this.queue.enqueue('collect_specs', {
        comparisonId,
        payload: { comparisonId, forceRefresh: true },
      });
      writeAuditLog(this.db, 'telegram', 'telegram_recollect', comparisonId);
      await this.answerCallbackQuery(callbackQueryId, 'Ambil ulang spek dijadwalkan.');
      await this.sendMessage(
        `🔄 <b>Ambil Ulang Spek:</b> ${escHtml(title)}\nWorker akan mengambil ulang spek terbaru (force refresh) dan me-render ulang video.`
      );
      return;
    }

    if (action === 'reject') {
      this.db
        .prepare("DELETE FROM jobs WHERE comparison_id = ? AND type = 'handoff' AND state = 'queued'")
        .run(comparisonId);
      this.db
        .prepare("UPDATE comparisons SET status = 'CANCELLED', updated_at = ? WHERE id = ?")
        .run(now, comparisonId);
      if (cmp.topic_id) {
        this.db.prepare("UPDATE topics SET status = 'rejected' WHERE id = ?").run(cmp.topic_id);
      }
      writeAuditLog(this.db, 'telegram', 'telegram_reject', comparisonId);
      await this.answerCallbackQuery(callbackQueryId, 'Video ditolak & dibatalkan.');
      await this.sendMessage(
        `❌ <b>Ditolak & Dibatalkan:</b> ${escHtml(title)}\nVideo tidak akan dikirim ke ytagent. Autopilot bebas lanjut ke topik berikutnya.`
      );
    }
  }

  /**
   * Starts lightweight long-polling loop for commands and inline buttons.
   */
  startPolling(): void {
    if (this.polling) return;
    this.polling = true;
    console.log('[telegram] Bot polling started (commands & inline review buttons active)');
    this.pollOnce();
  }

  stopPolling(): void {
    this.polling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollOnce(): Promise<void> {
    if (!this.polling) return;
    try {
      const res = await this.fetchImpl(this.apiUrl('getUpdates'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offset: this.lastUpdateId > 0 ? this.lastUpdateId + 1 : undefined,
          timeout: 15,
          allowed_updates: ['message', 'callback_query'],
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { ok?: boolean; result?: TelegramUpdate[] };
        if (data.ok && Array.isArray(data.result)) {
          for (const upd of data.result) {
            this.lastUpdateId = Math.max(this.lastUpdateId, upd.update_id);
            await this.handleUpdate(upd);
          }
        }
      }
    } catch (err: unknown) {
      console.warn('[telegram] Polling error (will retry):', err instanceof Error ? err.message : String(err));
    } finally {
      if (this.polling) {
        this.pollTimer = setTimeout(() => {
          this.pollOnce();
        }, 3000);
      }
    }
  }
}
