// packages/collectors/src/benchmarks/csv-importer.ts
// Imports benchmark snapshots from CSV into benchmark_snapshots and benchmark_scores.
// Specification: docs/MODULES.md §3

import { Database } from '@phone-studio/core';
import { ulid } from 'ulid';

export interface BenchmarkCsvRow {
  device: string;
  variant?: string;
  main: number;
  parts: Record<string, number>;
}

export interface BenchmarkImportResult {
  snapshotId: string;
  source: string;
  version: string;
  rowCount: number;
  matchedCount: number;
  unmatchedDevices: string[];
}

export function parseBenchmarkCsv(csvContent: string): { headers: string[]; rows: BenchmarkCsvRow[] } {
  const lines = csvContent
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (lines.length < 2) {
    throw new Error('CSV must contain a header and at least one data row');
  }

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const deviceIdx = headers.indexOf('device');
  const mainIdx = headers.indexOf('main');

  if (deviceIdx === -1 || mainIdx === -1) {
    throw new Error('CSV header must contain "device" and "main" columns');
  }

  const variantIdx = headers.indexOf('variant');
  const partHeaders = headers.filter((h) => !['device', 'variant', 'main'].includes(h));

  const rows: BenchmarkCsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawCols = lines[i].match(/(?:[^\",]+|\"[^\"]*\")+/g)?.map((c) => c.replace(/^\"|\"$/g, '').trim()) ??
      lines[i].split(',').map((c) => c.trim());
    const cols = rawCols;
    const device = cols[deviceIdx];
    const mainStr = cols[mainIdx];
    const mainNum = parseFloat(mainStr.replace(/,/g, ''));

    if (!device || isNaN(mainNum)) continue;

    const variant = variantIdx !== -1 ? cols[variantIdx] : undefined;
    const parts: Record<string, number> = {};

    for (const partKey of partHeaders) {
      const idx = headers.indexOf(partKey);
      if (idx !== -1 && cols[idx]) {
        const val = parseFloat(cols[idx].replace(/,/g, ''));
        if (!isNaN(val)) parts[partKey] = val;
      }
    }

    rows.push({ device, variant, main: mainNum, parts });
  }

  return { headers: partHeaders, rows };
}

export function importBenchmarkCsv(
  db: Database.Database,
  source: string,
  version: string,
  period: string, // e.g. "2026-10"
  csvContent: string,
  permissionNote = 'Manual user import'
): BenchmarkImportResult {
  const { rows } = parseBenchmarkCsv(csvContent);
  const snapshotId = ulid();
  const now = new Date().toISOString();

  // 1. Insert snapshot record
  db.prepare(
    `INSERT INTO benchmark_snapshots (id, source, version, period, taken_at, method, permission_note)
     VALUES (?, ?, ?, ?, ?, 'manual', ?)`
  ).run(snapshotId, source, version, period, now, permissionNote);

  let matchedCount = 0;
  const unmatchedDevices: string[] = [];

  // 2. Insert score records only for matched phones (avoids FK violation when foreign_keys=ON)
  for (const row of rows) {
    const phone = db
      .prepare(
        "SELECT id FROM phones WHERE LOWER(brand || ' ' || model) = LOWER(?) OR LOWER(model) = LOWER(?) LIMIT 1"
      )
      .get(row.device, row.device) as { id: string } | undefined;

    if (!phone) {
      unmatchedDevices.push(row.device);
      continue;
    }

    matchedCount++;

    db.prepare(
      `INSERT INTO benchmark_scores (id, snapshot_id, phone_id, variant_used, main, parts_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(snapshot_id, phone_id) DO UPDATE SET
         variant_used = excluded.variant_used,
         main = excluded.main,
         parts_json = excluded.parts_json`
    ).run(ulid(), snapshotId, phone.id, row.variant ?? null, row.main, JSON.stringify(row.parts));
  }

  return {
    snapshotId,
    source,
    version,
    rowCount: rows.length,
    matchedCount,
    unmatchedDevices,
  };
}
