// apps/web/src/app/api/jobs/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { JobQueue } from '@phone-studio/core';

export async function GET() {
  const db = getDb();
  const jobs = db
    .prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 50')
    .all();

  return NextResponse.json({ jobs });
}

export async function POST(req: Request) {
  const db = getDb();
  const { jobId } = await req.json();

  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
  }

  // Reset job to queued
  const now = new Date().toISOString();
  const res = db
    .prepare('UPDATE jobs SET state = "queued", attempt = 0, error = NULL, updated_at = ? WHERE id = ?')
    .run(now, jobId);

  if (res.changes === 0) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: 'Job re-queued' });
}
