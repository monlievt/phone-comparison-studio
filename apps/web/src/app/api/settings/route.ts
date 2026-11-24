// apps/web/src/app/api/settings/route.ts
// GET & PUT persistent studio settings, autopilot policy, brand image terms, and PAUSE kill switch.

import { NextResponse } from 'next/server';
import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import {
  getStudioSettings,
  saveStudioSettings,
  getBrandsPolicy,
  saveBrandsPolicy,
  writeAuditLog,
  AutopilotSettingsSchema,
  BrandPolicySchema,
} from '@phone-studio/core';
import { getDb } from '@/lib/db';
import { z } from 'zod';

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

const PutSettingsBodySchema = z.object({
  autopilot: AutopilotSettingsSchema.partial().optional(),
  excludedCategories: z.array(z.string()).optional(),
  brands: z.array(BrandPolicySchema).optional(),
  pauseFile: z.boolean().optional(),
  resetFailures: z.boolean().optional(),
});

export async function GET() {
  const db = getDb();
  const rootDir = getRootDir();
  const settings = getStudioSettings(db);
  const brands = getBrandsPolicy(db, join(rootDir, 'config'));
  const pauseFileExists = existsSync(getPauseFilePath());

  return NextResponse.json({
    settings,
    brands,
    pauseFileExists,
    isEffectivelyPaused: pauseFileExists || settings.autopilotPaused,
  });
}

export async function PUT(req: Request) {
  try {
    const db = getDb();
    const raw = await req.json();
    const parsed = PutSettingsBodySchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_SETTINGS',
            message: 'Invalid settings payload',
            details: parsed.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const body = parsed.data;
    let settings = getStudioSettings(db);

    if (body.autopilot || body.excludedCategories !== undefined || body.resetFailures) {
      settings = saveStudioSettings(db, {
        autopilot: body.autopilot,
        excludedCategories: body.excludedCategories,
        ...(body.resetFailures
          ? { autopilotPaused: false, autopilotPauseReason: null, consecutiveFailures: 0 }
          : {}),
      });
      writeAuditLog(db, 'owner', 'update_settings', 'studio_settings', {
        autopilot: body.autopilot,
        excludedCategories: body.excludedCategories,
        resetFailures: body.resetFailures,
      });
    }

    let brands = getBrandsPolicy(db, join(getRootDir(), 'config'));
    if (body.brands) {
      brands = saveBrandsPolicy(db, body.brands);
      writeAuditLog(db, 'owner', 'update_brands_policy', 'brands_policy', {
        count: brands.length,
      });
    }

    const pausePath = getPauseFilePath();
    if (typeof body.pauseFile === 'boolean') {
      if (body.pauseFile) {
        writeFileSync(pausePath, `Paused via dashboard at ${new Date().toISOString()}\n`, 'utf-8');
        settings = saveStudioSettings(db, {
          autopilotPaused: true,
          autopilotPauseReason: 'Manually paused by owner',
        });
        writeAuditLog(db, 'owner', 'autopilot_pause', 'PAUSE');
      } else {
        if (existsSync(pausePath)) {
          unlinkSync(pausePath);
        }
        settings = saveStudioSettings(db, {
          autopilotPaused: false,
          autopilotPauseReason: null,
          consecutiveFailures: 0,
        });
        writeAuditLog(db, 'owner', 'autopilot_resume', 'PAUSE');
      }
    }

    const pauseFileExists = existsSync(pausePath);
    return NextResponse.json({
      success: true,
      settings,
      brands,
      pauseFileExists,
      isEffectivelyPaused: pauseFileExists || settings.autopilotPaused,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: { code: 'SETTINGS_SAVE_FAILED', message } },
      { status: 500 }
    );
  }
}
