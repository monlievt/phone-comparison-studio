// apps/web/src/app/api/topics/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ulid } from 'ulid';
import { JobQueue } from '@phone-studio/core';

export async function GET() {
  const db = getDb();
  const topics = db
    .prepare('SELECT * FROM topics WHERE status = "proposed" ORDER BY score DESC, created_at DESC')
    .all();

  const formatted = topics.map((t: any) => ({
    id: t.id,
    phoneNames: JSON.parse(t.phone_ids_json),
    score: t.score,
    reasons: JSON.parse(t.reasons_json || '[]'),
    angle: t.angle,
    status: t.status,
    createdAt: t.created_at,
  }));

  return NextResponse.json({ topics: formatted });
}

export async function POST(req: Request) {
  const db = getDb();
  const { topicId, action } = await req.json();

  if (!topicId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid topicId or action' }, { status: 400 });
  }

  if (action === 'reject') {
    db.prepare('UPDATE topics SET status = "rejected" WHERE id = ?').run(topicId);
    return NextResponse.json({ success: true, status: 'rejected' });
  }

  // Action: approve -> create comparison and enqueue collect_specs job
  const topic = db.prepare('SELECT * FROM topics WHERE id = ?').get(topicId) as any;
  if (!topic) {
    return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
  }

  const comparisonId = ulid();
  const now = new Date().toISOString();
  const phoneNames: string[] = JSON.parse(topic.phone_ids_json);
  const phonesPayload = phoneNames.map((name) => {
    const parts = name.split(' ');
    return { brand: parts[0], model: parts.slice(1).join(' ') };
  });

  db.prepare(`
    INSERT INTO comparisons (id, title, phone_ids_json, formats_json, status, topic_id, created_at, updated_at)
    VALUES (?, ?, ?, '["long","short"]', 'CREATED', ?, ?, ?)
  `).run(
    comparisonId,
    phoneNames.join(' vs '),
    JSON.stringify(phonesPayload),
    topicId,
    now,
    now
  );

  db.prepare('UPDATE topics SET status = "approved" WHERE id = ?').run(topicId);

  // Enqueue collect_specs job
  const queue = new JobQueue(db);
  const jobId = queue.enqueue('collect_specs', { comparisonId });

  return NextResponse.json({
    success: true,
    comparisonId,
    jobId,
    status: 'approved',
  });
}
