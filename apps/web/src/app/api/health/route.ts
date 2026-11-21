// apps/web/src/app/api/health/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);

    // 1. DB check
    const dbCheck = db.prepare('SELECT 1 as alive').get() as { alive: number };

    // 2. LLM usage today
    const usage = db
      .prepare('SELECT provider, count FROM llm_usage WHERE day = ?')
      .all(today) as Array<{ provider: string; count: number }>;

    // 3. Active & queued jobs
    const jobsCount = db
      .prepare("SELECT state, count(*) as count FROM jobs WHERE state IN ('running', 'queued') GROUP BY state")
      .all() as Array<{ state: string; count: number }>;

    return NextResponse.json({
      status: 'ok',
      db: dbCheck.alive === 1 ? 'connected' : 'error',
      llmUsageToday: usage,
      activeJobs: jobsCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ status: 'error', message: err?.message }, { status: 500 });
  }
}
