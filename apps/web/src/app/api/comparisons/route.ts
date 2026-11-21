// apps/web/src/app/api/comparisons/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const comparisons = db
    .prepare('SELECT id, title, status, created_at, updated_at FROM comparisons ORDER BY created_at DESC LIMIT 50')
    .all();

  return NextResponse.json({ comparisons });
}
