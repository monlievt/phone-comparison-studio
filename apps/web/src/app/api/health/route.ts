// apps/web/src/app/api/health/route.ts
import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { join } from 'path';
import { getFreeDiskGB, getStudioSettings } from '@phone-studio/core';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const rootDir = process.cwd().includes('apps/web')
      ? join(process.cwd(), '../..')
      : process.cwd();
    const dataDir = join(rootDir, (process.env.DATA_DIR || './data').replace(/^\.\//, ''));

    // 1. DB check
    const dbCheck = db.prepare('SELECT 1 as alive').get() as { alive: number };

    // 2. LLM usage today with daily limits
    const usage = db
      .prepare('SELECT provider, count FROM llm_usage WHERE day = ?')
      .all(today) as Array<{ provider: string; count: number }>;

    const geminiLimit = Number(process.env.GEMINI_DAILY_LIMIT) || 1500;
    const groqLimit = Number(process.env.GROQ_DAILY_LIMIT) || 1000;

    const llm = [
      {
        provider: 'gemini-flash',
        used: usage.find((u) => u.provider === 'gemini-flash')?.count ?? 0,
        limit: geminiLimit,
      },
      {
        provider: 'groq-free',
        used: usage.find((u) => u.provider === 'groq-free')?.count ?? 0,
        limit: groqLimit,
      },
      {
        provider: 'gemini-pro',
        used: usage.find((u) => u.provider === 'gemini-pro')?.count ?? 0,
        limit: geminiLimit,
      },
    ];

    // 3. Active & queued jobs + render busy flag
    const jobsCount = db
      .prepare("SELECT state, count(*) as count FROM jobs WHERE state IN ('running', 'queued') GROUP BY state")
      .all() as Array<{ state: string; count: number }>;

    const renderRunning = db
      .prepare(
        "SELECT count(*) as count FROM jobs WHERE state = 'running' AND type IN ('render_preview', 'render_final', 'render_thumbnail')"
      )
      .get() as { count: number };

    const diskFreeGB = getFreeDiskGB(dataDir);
    const settings = getStudioSettings(db);
    const pauseFileExists = existsSync(join(dataDir, 'PAUSE'));

    return NextResponse.json({
      status: 'ok',
      db: dbCheck.alive === 1 ? 'connected' : 'error',
      diskFreeGB,
      renderBusy: (renderRunning?.count ?? 0) > 0,
      llm,
      llmUsageToday: usage,
      activeJobs: jobsCount,
      autopilot: {
        mode: settings.autopilot.mode,
        enabled: settings.autopilot.enabled,
        paused: pauseFileExists || settings.autopilotPaused,
        pauseReason: pauseFileExists ? 'PAUSE file present' : settings.autopilotPauseReason,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { status: 'error', error: { code: 'HEALTH_CHECK_FAILED', message } },
      { status: 500 }
    );
  }
}
