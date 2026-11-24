// apps/web/src/app/api/benchmarks/import/route.ts
// POST /api/benchmarks/import — imports benchmark CSV snapshot (AnTuTu, Geekbench, etc.) per API.md & MODULES.md §3.

import { NextResponse } from 'next/server';
import { importBenchmarkCsv } from '@phone-studio/collectors';
import { writeAuditLog } from '@phone-studio/core';
import { getDb } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const db = getDb();
    const contentType = req.headers.get('content-type') || '';

    let source = '';
    let version = '';
    let period = '';
    let permissionNote = 'Manual CSV import';
    let csvContent = '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      source = String(formData.get('source') || '').trim();
      version = String(formData.get('version') || '').trim();
      period = String(formData.get('period') || new Date().toISOString().slice(0, 7)).trim();
      permissionNote = String(formData.get('permissionNote') || 'Manual CSV import').trim();
      if (file) {
        csvContent = await file.text();
      } else if (formData.get('csvContent')) {
        csvContent = String(formData.get('csvContent'));
      }
    } else {
      const body = (await req.json()) as {
        source?: string;
        version?: string;
        period?: string;
        permissionNote?: string;
        csvContent?: string;
      };
      source = (body.source || '').trim();
      version = (body.version || '').trim();
      period = (body.period || new Date().toISOString().slice(0, 7)).trim();
      permissionNote = (body.permissionNote || 'Manual CSV import').trim();
      csvContent = body.csvContent || '';
    }

    if (!source || !version || !csvContent.trim()) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_BENCHMARK_IMPORT',
            message: 'source, version, and csvContent (or file) are required',
          },
        },
        { status: 400 }
      );
    }

    const result = importBenchmarkCsv(db, source, version, period, csvContent, permissionNote);
    writeAuditLog(db, 'owner', 'import_benchmark_csv', result.snapshotId, {
      source,
      version,
      period,
      rowCount: result.rowCount,
      matchedCount: result.matchedCount,
    });

    return NextResponse.json({ success: true, snapshot: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: { code: 'BENCHMARK_IMPORT_FAILED', message } },
      { status: 400 }
    );
  }
}
