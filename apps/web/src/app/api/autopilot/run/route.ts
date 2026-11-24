// apps/web/src/app/api/autopilot/run/route.ts
// Triggers an immediate on-demand Autopilot scheduler tick via the SQLite job queue,
// optionally enabling Autopilot mode and clearing any PAUSE kill switch / safety brakes.

import { NextResponse } from 'next/server';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import {
  JobQueue,
  getStudioSettings,
  saveStudioSettings,
  writeAuditLog,
} from '@phone-studio/core';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

function getRootDir(): string {
  return process.cwd().includes('apps/web')
    ? join(process.cwd(), '../..')
    : process.cwd();
}

function getPauseFilePath(): string {
  const dataDir = process.env.DATA_DIR || './data';
  const resolved = dataDir.startsWith('/') ? dataDir : join(getRootDir(), dataDir.replace(/^\.\//, ''));
  return join(resolved, 'PAUSE');
}

const RunAutopilotBodySchema = z.object({
  enable: z.boolean().optional(),
  resume: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const db = getDb();
    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      raw = {};
    }

    const parsed = RunAutopilotBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'INVALID_BODY', message: 'Invalid request body' } },
        { status: 400 }
      );
    }

    const { enable, resume } = parsed.data;
    const pausePath = getPauseFilePath();
    let settings = getStudioSettings(db);

    if (resume) {
      if (existsSync(pausePath)) {
        unlinkSync(pausePath);
      }
      settings = saveStudioSettings(db, {
        autopilotPaused: false,
        autopilotPauseReason: null,
        consecutiveFailures: 0,
      });
    }

    if (enable) {
      settings = saveStudioSettings(db, {
        autopilot: {
          mode: 'autopilot',
          enabled: true,
        },
      });
    }

    const pauseFileExists = existsSync(pausePath);
    const isEffectivelyPaused = pauseFileExists || settings.autopilotPaused;

    if (!settings.autopilot.enabled || settings.autopilot.mode !== 'autopilot') {
      return NextResponse.json(
        {
          error: {
            code: 'AUTOPILOT_DISABLED',
            message: 'Autopilot mode is disabled. Enable Autopilot mode first or pass { enable: true }.',
          },
        },
        { status: 400 }
      );
    }

    if (isEffectivelyPaused) {
      return NextResponse.json(
        {
          error: {
            code: 'AUTOPILOT_PAUSED',
            message: settings.autopilotPauseReason || 'Autopilot is currently paused (data/PAUSE active).',
          },
        },
        { status: 409 }
      );
    }

    const existing = db
      .prepare("SELECT id FROM jobs WHERE type = 'autopilot_tick' AND state IN ('queued', 'running') LIMIT 1")
      .get() as { id: string } | undefined;

    const queue = new JobQueue(db);
    const jobId = existing ? existing.id : queue.enqueue('autopilot_tick');

    writeAuditLog(db, 'owner', 'autopilot_run_now', jobId, {
      enable: Boolean(enable),
      resume: Boolean(resume),
      alreadyQueued: Boolean(existing),
    });

    return NextResponse.json({
      success: true,
      jobId,
      alreadyQueued: Boolean(existing),
      settings,
      isEffectivelyPaused,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: { code: 'AUTOPILOT_RUN_FAILED', message } },
      { status: 500 }
    );
  }
}
