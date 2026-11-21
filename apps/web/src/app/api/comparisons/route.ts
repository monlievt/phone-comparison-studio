// apps/web/src/app/api/comparisons/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ulid } from 'ulid';
import { JobQueue } from '@phone-studio/core';

export async function GET() {
  const db = getDb();
  const comparisons = db
    .prepare('SELECT id, title, status, created_at, updated_at FROM comparisons ORDER BY created_at DESC LIMIT 50')
    .all();

  return NextResponse.json({ comparisons });
}

export async function POST(req: Request) {
  const db = getDb();
  const body = await req.json();

  const { phones, formats = ['long', 'short'], title } = body;

  if (!phones || !Array.isArray(phones) || phones.length < 2) {
    return NextResponse.json({ error: 'Must provide at least 2 phones' }, { status: 400 });
  }

  const comparisonId = ulid();
  const now = new Date().toISOString();
  const autoTitle = title || phones.map((p: any) => `${p.brand} ${p.model}`).join(' vs ');

  db.prepare(`
    INSERT INTO comparisons (id, title, phone_ids_json, formats_json, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'CREATED', ?, ?)
  `).run(
    comparisonId,
    autoTitle,
    JSON.stringify(phones),
    JSON.stringify(formats),
    now,
    now
  );

  // Enqueue collect_specs job immediately
  const queue = new JobQueue(db);
  const jobId = queue.enqueue('collect_specs', { comparisonId });

  return NextResponse.json({
    success: true,
    comparisonId,
    jobId,
  });
}
