// apps/web/src/app/api/topics/candidates/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const candidates = db
    .prepare(`
      SELECT id, brand, model, source, source_url, status, announced_date, created_at
      FROM phone_candidates
      ORDER BY created_at DESC
      LIMIT 100
    `)
    .all();

  return NextResponse.json({ candidates });
}
