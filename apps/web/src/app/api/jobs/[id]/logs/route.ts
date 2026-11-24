// apps/web/src/app/api/jobs/[id]/logs/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { JobQueue } from '@phone-studio/core';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const queue = new JobQueue(db);

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as any;
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const logs = queue.getLogs(id);

  return NextResponse.json({
    job: {
      id: job.id,
      type: job.type,
      state: job.state,
      attempt: job.attempt,
      max_attempts: job.max_attempts,
      error: job.error,
      created_at: job.created_at,
      updated_at: job.updated_at,
    },
    logs,
  });
}
