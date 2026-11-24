// apps/web/src/app/api/comparisons/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ulid } from 'ulid';
import { JobQueue, getStudioSettings, writeAuditLog } from '@phone-studio/core';
import { z } from 'zod';

const CreateComparisonSchema = z.object({
  phones: z
    .array(
      z.object({
        brand: z.string().min(1),
        model: z.string().min(1),
        variant: z.string().optional(),
        specUrl: z.string().url().optional(),
      })
    )
    .min(2)
    .max(3),
  formats: z.array(z.enum(['long', 'short'])).min(1).default(['long', 'short']),
  title: z.string().optional(),
  themePreset: z.enum(['v1', 'v2', 'v3']).optional(),
  topicId: z.string().optional(),
});

export async function GET(req: Request) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const comparisons = status
    ? db
      .prepare('SELECT id, title, status, theme_version, created_at, updated_at FROM comparisons WHERE status = ? ORDER BY created_at DESC LIMIT 50')
      .all(status)
    : db
      .prepare('SELECT id, title, status, theme_version, created_at, updated_at FROM comparisons ORDER BY created_at DESC LIMIT 50')
      .all();

  return NextResponse.json({ comparisons });
}

export async function POST(req: Request) {
  const db = getDb();
  const raw = await req.json();
  const parsed = CreateComparisonSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_REQUEST',
          message: 'Must provide 2 to 3 valid phones and at least one format',
          details: parsed.error.issues,
        },
      },
      { status: 400 }
    );
  }

  const { phones, formats, title, topicId } = parsed.data;
  const settings = getStudioSettings(db);
  const themeVersion = parsed.data.themePreset ?? settings.autopilot.defaultTemplate ?? 'v3';

  const comparisonId = ulid();
  const now = new Date().toISOString();
  const autoTitle = title || phones.map((p) => `${p.brand} ${p.model}`).join(' vs ');

  db.prepare(`
    INSERT INTO comparisons (id, title, phone_ids_json, formats_json, theme_version, status, topic_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'CREATED', ?, ?, ?)
  `).run(
    comparisonId,
    autoTitle,
    JSON.stringify(phones),
    JSON.stringify(formats),
    themeVersion,
    topicId ?? null,
    now,
    now
  );

  writeAuditLog(db, 'owner', 'create_comparison', comparisonId, { phones, formats, themeVersion });

  const queue = new JobQueue(db);
  const jobId = queue.enqueue('collect_specs', { comparisonId });

  return NextResponse.json({
    success: true,
    comparisonId,
    jobId,
  });
}
