// apps/web/src/app/api/jobs/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

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
    .prepare("UPDATE jobs SET state = 'queued', attempt = 0, error = NULL, updated_at = ? WHERE id = ?")
    .run(now, jobId);

  if (res.changes === 0) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: 'Job re-queued successfully' });
}

export async function DELETE(req: Request) {
  const db = getDb();
  const url = new URL(req.url);
  let jobId = url.searchParams.get('id');

  if (!jobId) {
    try {
      const body = (await req.json()) as { jobId?: string };
      jobId = body.jobId ?? null;
    } catch {
      jobId = null;
    }
  }

  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
  }

  const existing = db
    .prepare('SELECT id, state FROM jobs WHERE id = ?')
    .get(jobId) as { id: string; state: string } | undefined;

  if (!existing) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  if (existing.state !== 'failed' && existing.state !== 'blocked') {
    return NextResponse.json(
      { error: `Only failed or blocked jobs can be dismissed (current state: ${existing.state})` },
      { status: 409 }
    );
  }

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM job_logs WHERE job_id = ?').run(jobId);
    db.prepare('DELETE FROM jobs WHERE id = ?').run(jobId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return NextResponse.json({ success: true, dismissedId: jobId });
}
