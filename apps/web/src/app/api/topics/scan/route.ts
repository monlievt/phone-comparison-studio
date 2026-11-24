// apps/web/src/app/api/topics/scan/route.ts
import { NextResponse } from 'next/server';
import { join } from 'path';
import { existsSync } from 'fs';
import { getDb } from '@/lib/db';
import { CandidateTrackerService } from '@phone-studio/collectors';
import { loadAiConfig } from '@phone-studio/core';
import { LlmRouter } from '@phone-studio/ai';
import { readEnvVars } from '@/lib/env-file';

function resolveConfigDir(): string {
  const candidates = [
    join(process.cwd(), 'config'),
    join(process.cwd(), '..', '..', 'config'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'ai.json'))) return dir;
  }
  return candidates[0];
}

export async function POST(req: Request) {
  const db = getDb();
  const tracker = new CandidateTrackerService(db);

  let mode: 'rss' | 'gemini' | 'all' = 'rss';
  let skipCache = false;
  try {
    const body = (await req.json()) as { mode?: string; skipCache?: boolean };
    if (body?.mode === 'gemini' || body?.mode === 'all' || body?.mode === 'rss') {
      mode = body.mode;
    }
    skipCache = Boolean(body?.skipCache);
  } catch {
    // Empty body defaults to multi-source RSS scan
  }

  try {
    let router: LlmRouter | undefined;
    if (mode === 'gemini' || mode === 'all') {
      const aiConfig = loadAiConfig(join(resolveConfigDir(), 'ai.json'));
      const envMap = readEnvVars();
      router = new LlmRouter({
        db,
        aiConfig,
        apiKeys: {
          gemini: process.env.GEMINI_API_KEY || envMap.GEMINI_API_KEY,
          groq: process.env.GROQ_API_KEY || envMap.GROQ_API_KEY,
        },
      });
    }

    const summary = await tracker.runDiscovery({
      includeRss: mode === 'rss' || mode === 'all',
      includeGemini: mode === 'gemini' || mode === 'all',
      router,
      skipCache,
    });

    const total = (db.prepare('SELECT count(*) as count FROM phone_candidates').get() as { count: number }).count;

    return NextResponse.json({
      success: true,
      mode,
      summary,
      totalCandidates: total,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Discovery scan failed' },
      { status: 500 }
    );
  }
}
