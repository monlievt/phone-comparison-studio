// apps/web/src/app/api/comparisons/[id]/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { JobQueue } from '@phone-studio/core';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const comparison = db.prepare('SELECT * FROM comparisons WHERE id = ?').get(id) as any;
  if (!comparison) {
    return NextResponse.json({ error: 'Comparison not found' }, { status: 404 });
  }

  // Parse phones
  let phoneNames: Array<{ brand: string; model: string }> = [];
  try {
    phoneNames = JSON.parse(comparison.phone_ids_json);
  } catch {
    phoneNames = [];
  }

  // Get phones from DB
  const phones = db.prepare(`
    SELECT p.*, i.file_path as image_path, i.license as image_license, i.status as image_status
    FROM phones p
    LEFT JOIN images i ON i.phone_id = p.id
    WHERE p.brand IN (${phoneNames.map(() => '?').join(',') || "''"})
  `).all(...phoneNames.map((p) => p.brand)) as any[];

  // Get specs for all these phones
  const specs = db.prepare(`
    SELECT sv.*, p.brand, p.model
    FROM spec_values sv
    JOIN phones p ON p.id = sv.phone_id
    WHERE sv.phone_id IN (${phones.map(() => '?').join(',') || "''"})
  `).all(...phones.map((p) => p.id)) as any[];

  // Get copy assets if any
  const copyAssets = db.prepare(`
    SELECT * FROM copy_assets WHERE comparison_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(id) as any;

  // Get renders if any
  const renders = db.prepare(`
    SELECT * FROM renders WHERE comparison_id = ?
  `).all(id) as any[];

  return NextResponse.json({
    comparison: {
      ...comparison,
      final_json: comparison.final_json ? JSON.parse(comparison.final_json) : null,
      formats: JSON.parse(comparison.formats_json || '[]'),
    },
    phones,
    specs,
    copy: copyAssets ? JSON.parse(copyAssets.payload_json) : null,
    renders,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json();

  const { action, specUpdates, copyUpdates } = body;

  if (action === 'update_spec') {
    // specUpdates: { phoneId, categoryKey, rawValue }
    const { phoneId, categoryKey, rawValue } = specUpdates;
    db.prepare(`
      UPDATE spec_values 
      SET raw_value = ?, confidence = 1.0, source_kind = 'manual'
      WHERE phone_id = ? AND category_key = ?
    `).run(rawValue, phoneId, categoryKey);

    return NextResponse.json({ success: true });
  }

  if (action === 'approve_gate_a') {
    // Approve Gate A -> Enqueue compute_verdict job
    db.prepare(`UPDATE comparisons SET status = 'DATA_APPROVED', updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id);

    const queue = new JobQueue(db);
    const jobId = queue.enqueue('compute_verdict', { comparisonId: id });

    return NextResponse.json({ success: true, jobId, nextStatus: 'DATA_APPROVED' });
  }

  if (action === 'update_copy') {
    // Update copy assets from Gate B
    const existing = db.prepare('SELECT id FROM copy_assets WHERE comparison_id = ? LIMIT 1').get(id) as any;
    if (existing) {
      db.prepare('UPDATE copy_assets SET payload_json = ? WHERE id = ?')
        .run(JSON.stringify(copyUpdates), existing.id);
    }
    return NextResponse.json({ success: true });
  }

  if (action === 'approve_gate_b') {
    // Approve Gate B -> Advance to VIDEO_APPROVED & enqueue handoff or final render
    db.prepare(`UPDATE comparisons SET status = 'VIDEO_APPROVED', updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id);

    const queue = new JobQueue(db);
    const jobId = queue.enqueue('handoff', { comparisonId: id });

    return NextResponse.json({ success: true, jobId, nextStatus: 'VIDEO_APPROVED' });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
