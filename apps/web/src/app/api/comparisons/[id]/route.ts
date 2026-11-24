// apps/web/src/app/api/comparisons/[id]/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  JobQueue,
  validateNumbers,
  writeAuditLog,
  getSettingValue,
  setSettingValue,
  ComparisonInput,
} from '@phone-studio/core';
import { checkCopyRules, CopyAllSchema } from '@phone-studio/ai';

interface PhoneSpecRef {
  brand: string;
  model: string;
  variant?: string;
}

function parsePhoneRefs(rawJson: string): PhoneSpecRef[] {
  try {
    const parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      if (typeof item === 'string') {
        const parts = item.trim().split(/\s+/);
        return { brand: parts[0] || '', model: parts.slice(1).join(' ') };
      }
      return {
        brand: String(item.brand || ''),
        model: String(item.model || ''),
        variant: item.variant ? String(item.variant) : undefined,
      };
    });
  } catch {
    return [];
  }
}

function loadComparisonPhones(db: ReturnType<typeof getDb>, refs: PhoneSpecRef[]) {
  const phones: Record<string, unknown>[] = [];
  const seenIds = new Set<string>();

  for (const ref of refs) {
    const row = db
      .prepare(
        `SELECT p.*, i.id as image_id, i.file_path as image_path, i.license as image_license,
                i.source_url as image_source_url, i.accessed_at as image_accessed_at,
                i.kind as image_kind, i.status as image_status
         FROM phones p
         LEFT JOIN images i ON i.phone_id = p.id AND i.status = 'ok'
         WHERE LOWER(p.brand) = LOWER(?) AND LOWER(p.model) = LOWER(?)
         ORDER BY p.created_at DESC
         LIMIT 1`
      )
      .get(ref.brand, ref.model) as Record<string, unknown> | undefined;

    if (row && typeof row.id === 'string' && !seenIds.has(row.id)) {
      seenIds.add(row.id);
      phones.push(row);
    }
  }
  return phones;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const comparison = db.prepare('SELECT * FROM comparisons WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!comparison) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Comparison not found' } },
      { status: 404 }
    );
  }

  const refs = parsePhoneRefs(String(comparison.phone_ids_json || '[]'));
  const phones = loadComparisonPhones(db, refs);
  const phoneIds = phones.map((p) => String(p.id));

  const specs =
    phoneIds.length > 0
      ? (db
        .prepare(
          `SELECT sv.*, p.brand, p.model
             FROM spec_values sv
             JOIN phones p ON p.id = sv.phone_id
             WHERE sv.phone_id IN (${phoneIds.map(() => '?').join(',')})`
        )
        .all(...phoneIds) as Record<string, unknown>[])
      : [];

  const copyAssets = db
    .prepare('SELECT * FROM copy_assets WHERE comparison_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(id) as { payload_json: string; prompt_id?: string; provider?: string; model?: string } | undefined;

  const renders = db
    .prepare('SELECT * FROM renders WHERE comparison_id = ? ORDER BY created_at DESC')
    .all(id) as Record<string, unknown>[];

  const publications = db
    .prepare('SELECT * FROM publications WHERE comparison_id = ? ORDER BY created_at DESC')
    .all(id) as Record<string, unknown>[];

  const jobs = db
    .prepare(
      `SELECT id, comparison_id, type, state, progress, error, run_after, created_at, updated_at
       FROM jobs
       WHERE comparison_id = ? OR payload_json LIKE ?
       ORDER BY created_at DESC LIMIT 15`
    )
    .all(id, `%"comparisonId":"${id}"%`) as Record<string, unknown>[];

  const benchmarks =
    phoneIds.length > 0
      ? (db
        .prepare(
          `SELECT bs.*, bsnap.source, bsnap.version, bsnap.period, p.brand, p.model
             FROM benchmark_scores bs
             JOIN benchmark_snapshots bsnap ON bsnap.id = bs.snapshot_id
             JOIN phones p ON p.id = bs.phone_id
             WHERE bs.phone_id IN (${phoneIds.map(() => '?').join(',')})`
        )
        .all(...phoneIds) as Record<string, unknown>[])
      : [];

  const excludedCategories =
    getSettingValue<string[]>(db, `excluded_categories:${id}`) ?? [];

  const finalJson = comparison.final_json
    ? (JSON.parse(String(comparison.final_json)) as ComparisonInput)
    : null;
  const copy = copyAssets ? JSON.parse(copyAssets.payload_json) : null;

  // Real validateNumbers() check on titles & hook (and intro paragraph before chapters)
  let numberValidation: { passed: boolean; offenders: Array<{ token: string; context: string }>; copyRuleIssues: string[] } = {
    passed: true,
    offenders: [],
    copyRuleIssues: [],
  };
  if (finalJson && copy) {
    const introParagraph = String(copy.description || '').split('\n\n')[0] || '';
    const textsToCheck = [
      ...(Array.isArray(copy.titles) ? copy.titles : []),
      String(copy.hook || ''),
      introParagraph,
    ].filter(Boolean);
    const offenders = validateNumbers(finalJson, textsToCheck);
    const parsedCopy = CopyAllSchema.safeParse(copy);
    const copyRuleIssues = parsedCopy.success ? checkCopyRules(parsedCopy.data) : ['Copy schema invalid'];
    numberValidation = {
      passed: offenders.length === 0 && copyRuleIssues.length === 0,
      offenders,
      copyRuleIssues,
    };
  }

  return NextResponse.json({
    comparison: {
      ...comparison,
      final_json: finalJson,
      formats: JSON.parse(String(comparison.formats_json || '[]')),
    },
    phones,
    specs,
    benchmarks,
    copy,
    copyMeta: copyAssets
      ? {
        promptId: copyAssets.prompt_id ?? null,
        provider: copyAssets.provider ?? null,
        model: copyAssets.model ?? null,
      }
      : null,
    renders,
    publications,
    jobs,
    excludedCategories,
    numberValidation,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const body = (await req.json()) as Record<string, unknown>;
  const action = String(body.action || '');

  const comparison = db.prepare('SELECT * FROM comparisons WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!comparison) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Comparison not found' } },
      { status: 404 }
    );
  }

  if (action === 'update_spec') {
    const specUpdates = body.specUpdates as {
      phoneId: string;
      categoryKey: string;
      rawValue: string;
      sourceUrl?: string;
    };
    const now = new Date().toISOString();
    const trimmed = (specUpdates.rawValue ?? '').trim();

    db.prepare(
      `UPDATE spec_values
       SET raw_value = ?, confidence = 1.0, conflict = 0, source_kind = 'manual',
           source_url = COALESCE(?, source_url), fetched_at = ?
       WHERE phone_id = ? AND category_key = ?`
    ).run(trimmed || null, specUpdates.sourceUrl ?? null, now, specUpdates.phoneId, specUpdates.categoryKey);

    // Sync price_usd on phones table when price category is edited
    if (specUpdates.categoryKey === 'price') {
      const priceNum = parseFloat(trimmed.replace(/[^0-9.]/g, ''));
      db.prepare('UPDATE phones SET price_usd = ? WHERE id = ?').run(
        isNaN(priceNum) ? null : priceNum,
        specUpdates.phoneId
      );
    }

    writeAuditLog(db, 'owner', 'edit_spec', id, {
      phoneId: specUpdates.phoneId,
      categoryKey: specUpdates.categoryKey,
      rawValue: trimmed,
    });

    return NextResponse.json({ success: true });
  }

  if (action === 'toggle_exclude_category') {
    const categoryKey = String(body.categoryKey || '');
    const current = getSettingValue<string[]>(db, `excluded_categories:${id}`) ?? [];
    const next = current.includes(categoryKey)
      ? current.filter((k) => k !== categoryKey)
      : [...current, categoryKey];
    setSettingValue(db, `excluded_categories:${id}`, next);
    writeAuditLog(db, 'owner', 'toggle_exclude_category', id, { categoryKey, excluded: next.includes(categoryKey) });
    return NextResponse.json({ success: true, excludedCategories: next });
  }

  if (action === 'standardize_specs') {
    // Only formats display strings cleanly — NEVER fabricates missing values or fakes confidence=1.0
    const refs = parsePhoneRefs(String(comparison.phone_ids_json || '[]'));
    const phones = loadComparisonPhones(db, refs);
    const phoneIds = phones.map((p) => String(p.id));

    if (phoneIds.length > 0) {
      const specs = db
        .prepare(
          `SELECT id, category_key, raw_value FROM spec_values
           WHERE phone_id IN (${phoneIds.map(() => '?').join(',')})`
        )
        .all(...phoneIds) as Array<{ id: string; category_key: string; raw_value: string | null }>;

      for (const spec of specs) {
        let clean = spec.raw_value;
        if (!clean) continue;

        if (spec.category_key === 'chipset') {
          clean = clean
            .replace(/^(Qualcomm|MediaTek|Google|Apple|Samsung)\s+/i, '')
            .replace(/\s*\([0-9]+\s*nm\)/i, '')
            .replace(/SM[0-9]+(-[A-Z0-9]+)?\s*/i, '')
            .trim();
        } else if (spec.category_key === 'ram' || spec.category_key === 'storage') {
          const tokens = clean.match(/\d+\s*(GB|TB)/gi);
          if (tokens && tokens.length > 0) {
            clean = tokens.map((t) => t.replace(/\s+/g, '').toUpperCase()).join(' / ');
          }
        } else if (spec.category_key === 'price') {
          const num = clean.replace(/[^0-9]/g, '');
          if (num) clean = `$${num}`;
        } else if (spec.category_key === 'selfie_camera') {
          const match = clean.match(/(\d+)\s*MP/i);
          if (match) clean = `${match[1]} MP`;
        } else if (spec.category_key === 'refresh_rate') {
          const match = clean.match(/(\d{2,3})\s*Hz/i);
          if (match) clean = `${match[1]} Hz`;
        } else if (spec.category_key === 'peak_brightness') {
          const num = clean.replace(/[^0-9]/g, '');
          if (num && parseInt(num, 10) > 100) {
            clean = `${parseInt(num, 10).toLocaleString('en-US')} nits`;
          }
        } else if (spec.category_key === 'resolution') {
          const m = clean.match(/(\d{3,4})\s*[x×]\s*(\d{3,4})/i);
          if (m) clean = `${m[1]} × ${m[2]} px`;
        } else if (spec.category_key === 'weight') {
          const m = clean.match(/(\d{2,3}(\.\d+)?)\s*g/i);
          if (m) clean = `${m[1]} g`;
        } else if (spec.category_key === 'battery') {
          const m = clean.replace(/,/g, '').match(/(\d{4,5})/);
          if (m) clean = `${parseInt(m[1], 10).toLocaleString('en-US')} mAh`;
        } else if (spec.category_key === 'charging') {
          const m = clean.match(/(\d+)\s*W/i);
          if (m) clean = `${m[1]} W`;
        }

        // Preserve original confidence & source_kind (do NOT fake verified status)
        db.prepare('UPDATE spec_values SET raw_value = ? WHERE id = ?').run(clean, spec.id);
      }
    }

    writeAuditLog(db, 'owner', 'standardize_specs', id);
    return NextResponse.json({ success: true });
  }

  if (action === 'update_phone_image') {
    const imageUpdates = body.imageUpdates as {
      phoneId: string;
      filePath: string;
      license: string;
      sourceUrl: string;
    };

    if (!imageUpdates?.license?.trim() || !imageUpdates?.sourceUrl?.trim()) {
      return NextResponse.json(
        {
          error: {
            code: 'LICENSE_REQUIRED',
            message: 'Hard Rule #4: license and sourceUrl are required for any phone image.',
          },
        },
        { status: 400 }
      );
    }

    const imgId = 'img_' + imageUpdates.phoneId;
    db.prepare('DELETE FROM images WHERE phone_id = ?').run(imageUpdates.phoneId);
    db.prepare(
      `INSERT INTO images (id, phone_id, kind, file_path, license, source_url, accessed_at, status)
       VALUES (?, ?, 'front', ?, ?, ?, ?, 'ok')`
    ).run(
      imgId,
      imageUpdates.phoneId,
      imageUpdates.filePath,
      imageUpdates.license.trim(),
      imageUpdates.sourceUrl.trim(),
      new Date().toISOString().slice(0, 10)
    );

    writeAuditLog(db, 'owner', 'update_phone_image', id, imageUpdates);
    return NextResponse.json({ success: true });
  }

  if (action === 'remove_phone_image') {
    const phoneId = String(body.phoneId || '');
    db.prepare('DELETE FROM images WHERE phone_id = ?').run(phoneId);
    writeAuditLog(db, 'owner', 'use_parametric_phone', id, { phoneId });
    return NextResponse.json({ success: true });
  }

  if (action === 'recollect_specs') {
    const queue = new JobQueue(db);
    db.prepare("UPDATE comparisons SET status = 'DRAFT', updated_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      id
    );
    queue.enqueue('collect_specs', {
      comparisonId: id,
      payload: { comparisonId: id, forceRefresh: true },
    });
    writeAuditLog(db, 'owner', 'recollect_specs', id);
    return NextResponse.json({ success: true, message: 'Spec re-collection queued with grounded search.' });
  }

  if (action === 'update_theme') {
    const themePreset = String(body.themePreset || 'v3');
    db.prepare('UPDATE comparisons SET theme_version = ?, updated_at = ? WHERE id = ?').run(
      themePreset,
      new Date().toISOString(),
      id
    );
    return NextResponse.json({ success: true });
  }

  if (action === 'approve_gate_a' || action === 'recompute_and_render') {
    const themePreset = body.themePreset ? String(body.themePreset) : undefined;
    if (themePreset) {
      db.prepare('UPDATE comparisons SET theme_version = ? WHERE id = ?').run(themePreset, id);
    }

    // Gate A validation: block with 409 if any non-excluded phone uses a blocked/unlicensed image
    const refs = parsePhoneRefs(String(comparison.phone_ids_json || '[]'));
    const phones = loadComparisonPhones(db, refs);
    const phoneIds = phones.map((p) => String(p.id));

    if (phoneIds.length < 2) {
      return NextResponse.json(
        {
          error: {
            code: 'GATE_A_BLOCKED',
            message: 'At least 2 collected phones are required before approving Gate A.',
          },
        },
        { status: 409 }
      );
    }

    const blockedImages = db
      .prepare(
        `SELECT phone_id, license FROM images
         WHERE phone_id IN (${phoneIds.map(() => '?').join(',')})
           AND status = 'ok' AND (license IS NULL OR license = '')`
      )
      .all(...phoneIds) as Array<{ phone_id: string }>;

    if (blockedImages.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: 'UNLICENSED_IMAGE',
            message: 'Gate A blocked: one or more active images lack license metadata. Switch to Parametric Phone or add license.',
          },
        },
        { status: 409 }
      );
    }

    db.prepare(`UPDATE comparisons SET status = 'DATA_APPROVED', updated_at = ? WHERE id = ?`).run(
      new Date().toISOString(),
      id
    );
    writeAuditLog(db, 'owner', action, id, { themePreset });

    const queue = new JobQueue(db);
    const jobId = queue.enqueue('compute_verdict', { comparisonId: id });

    return NextResponse.json({ success: true, jobId, nextStatus: 'DATA_APPROVED' });
  }

  if (action === 'update_copy') {
    const copyUpdates = body.copyUpdates as {
      titles?: string[];
      shortTitles?: string[];
      hook?: string;
      description?: string;
      tags?: string[];
      hashtags?: string[];
    };

    const existing = db
      .prepare('SELECT id, payload_json FROM copy_assets WHERE comparison_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(id) as { id: string; payload_json: string } | undefined;

    if (!existing) {
      return NextResponse.json(
        { error: { code: 'NO_COPY', message: 'No copy asset exists yet for this comparison.' } },
        { status: 404 }
      );
    }

    const merged = { ...JSON.parse(existing.payload_json), ...copyUpdates };
    const finalJson = comparison.final_json
      ? (JSON.parse(String(comparison.final_json)) as ComparisonInput)
      : null;

    let offenders: Array<{ token: string; context: string }> = [];
    if (finalJson) {
      const introParagraph = String(merged.description || '').split('\n\n')[0] || '';
      offenders = validateNumbers(finalJson, [
        ...(Array.isArray(merged.titles) ? merged.titles : []),
        String(merged.hook || ''),
        introParagraph,
      ]);
      if (offenders.length > 0) {
        return NextResponse.json(
          {
            error: {
              code: 'NUMBER_VALIDATION_FAILED',
              message: `Hard Rule #3: Unverified numbers found in copy: ${offenders.map((o) => o.token).join(', ')}`,
              details: offenders,
            },
          },
          { status: 400 }
        );
      }
    }

    db.prepare('UPDATE copy_assets SET payload_json = ? WHERE id = ?').run(
      JSON.stringify(merged),
      existing.id
    );

    // Sync hook into final_json so re-render uses the edited hook
    if (finalJson && typeof merged.hook === 'string') {
      finalJson.hook = merged.hook.slice(0, 40);
      db.prepare('UPDATE comparisons SET final_json = ?, updated_at = ? WHERE id = ?').run(
        JSON.stringify(finalJson),
        new Date().toISOString(),
        id
      );
    }

    writeAuditLog(db, 'owner', 'edit_copy', id, { hook: merged.hook, titleCount: merged.titles?.length });
    return NextResponse.json({ success: true, copy: merged, offenders: [] });
  }

  if (action === 'approve_gate_b' || action === 'render_final') {
    // Gate B: run validateNumbers() before allowing final render
    const finalJson = comparison.final_json
      ? (JSON.parse(String(comparison.final_json)) as ComparisonInput)
      : null;
    const copyRow = db
      .prepare('SELECT payload_json FROM copy_assets WHERE comparison_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(id) as { payload_json: string } | undefined;

    if (finalJson && copyRow) {
      const copyData = JSON.parse(copyRow.payload_json);
      const introParagraph = String(copyData.description || '').split('\n\n')[0] || '';
      const offenders = validateNumbers(finalJson, [
        ...(Array.isArray(copyData.titles) ? copyData.titles : []),
        String(copyData.hook || ''),
        introParagraph,
      ]);
      if (offenders.length > 0) {
        return NextResponse.json(
          {
            error: {
              code: 'NUMBER_VALIDATION_FAILED',
              message: `Cannot approve Gate B: unverified numbers in copy (${offenders.map((o) => o.token).join(', ')})`,
              details: offenders,
            },
          },
          { status: 409 }
        );
      }
    }

    db.prepare(`UPDATE comparisons SET status = 'VIDEO_APPROVED', updated_at = ? WHERE id = ?`).run(
      new Date().toISOString(),
      id
    );
    writeAuditLog(db, 'owner', action, id);

    let formats: string[] = ['long', 'short'];
    try {
      const parsed = JSON.parse(String(comparison.formats_json || '["long","short"]'));
      if (Array.isArray(parsed) && parsed.length > 0) formats = parsed;
    } catch {
      // default
    }

    const queue = new JobQueue(db);
    const jobIds: string[] = [];
    for (const fmt of formats) {
      jobIds.push(queue.enqueue('render_final', { comparisonId: id, payload: { format: fmt } }));
    }
    jobIds.push(queue.enqueue('render_thumbnail', { comparisonId: id, payload: { stage: 'final' } }));

    return NextResponse.json({
      success: true,
      jobIds,
      nextStatus: 'VIDEO_APPROVED',
      message: 'Gate B approved. Final 1080p renders and thumbnail queued.',
    });
  }

  if (action === 'publish') {
    const selectedTitle = body.title ? String(body.title) : undefined;
    const visibility = (body.visibility as 'private' | 'unlisted' | 'public') || 'private';
    const publishAt = body.publishAt ? String(body.publishAt) : undefined;

    if (selectedTitle) {
      const copyRow = db
        .prepare('SELECT id, payload_json FROM copy_assets WHERE comparison_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(id) as { id: string; payload_json: string } | undefined;
      if (copyRow) {
        const parsed = JSON.parse(copyRow.payload_json);
        const otherTitles = (parsed.titles || []).filter((t: string) => t !== selectedTitle);
        parsed.titles = [selectedTitle, ...otherTitles];
        db.prepare('UPDATE copy_assets SET payload_json = ? WHERE id = ?').run(
          JSON.stringify(parsed),
          copyRow.id
        );
      }
    }

    const queue = new JobQueue(db);
    const jobId = queue.enqueue('handoff', {
      comparisonId: id,
      payload: { visibility, publishAt, title: selectedTitle },
    });

    writeAuditLog(db, 'owner', 'publish_handoff', id, { visibility, publishAt, selectedTitle });
    return NextResponse.json({ success: true, jobId, message: 'Handoff to ytagent queued.' });
  }

  if (action === 'cancel_hold') {
    db.prepare(
      `UPDATE jobs SET state = 'failed', error = 'Cancelled by owner during hold window', updated_at = ?
       WHERE comparison_id = ? AND type = 'handoff' AND state = 'queued'`
    ).run(new Date().toISOString(), id);

    db.prepare(`UPDATE comparisons SET status = 'CANCELLED', updated_at = ? WHERE id = ?`).run(
      new Date().toISOString(),
      id
    );
    writeAuditLog(db, 'owner', 'cancel_hold', id);
    return NextResponse.json({ success: true, nextStatus: 'CANCELLED' });
  }

  return NextResponse.json(
    { error: { code: 'UNKNOWN_ACTION', message: `Unknown action: ${action}` } },
    { status: 400 }
  );
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const existing = db.prepare('SELECT id FROM comparisons WHERE id = ?').get(id) as { id: string } | undefined;
  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Comparison not found' } },
      { status: 404 }
    );
  }

  const running = db
    .prepare("SELECT count(*) as c FROM jobs WHERE comparison_id = ? AND state = 'running'")
    .get(id) as { c: number };
  if (running.c > 0) {
    return NextResponse.json(
      { error: { code: 'JOB_RUNNING', message: 'Cannot delete while a worker job is running for this comparison.' } },
      { status: 409 }
    );
  }

  db.exec('BEGIN');
  try {
    const jobIds = db
      .prepare('SELECT id FROM jobs WHERE comparison_id = ?')
      .all(id) as Array<{ id: string }>;
    for (const j of jobIds) {
      db.prepare('DELETE FROM job_logs WHERE job_id = ?').run(j.id);
    }
    db.prepare('DELETE FROM jobs WHERE comparison_id = ?').run(id);
    db.prepare('DELETE FROM copy_assets WHERE comparison_id = ?').run(id);
    db.prepare('DELETE FROM renders WHERE comparison_id = ?').run(id);
    db.prepare('DELETE FROM publications WHERE comparison_id = ?').run(id);
    db.prepare('DELETE FROM settings WHERE key = ?').run(`excluded_categories:${id}`);
    db.prepare('DELETE FROM comparisons WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  writeAuditLog(db, 'owner', 'delete_comparison', id);
  return NextResponse.json({ success: true, deletedId: id });
}
