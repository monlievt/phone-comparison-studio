// apps/web/src/app/api/topics/generate/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ulid } from 'ulid';
import { proposePairs, PhoneCandidateForPair } from '@phone-studio/collectors';
import { loadSocTiers, lookupSocTier } from '@phone-studio/core';

interface GenerateOptions {
  priceBand?: 'all' | 'budget' | 'midrange' | 'flagship';
  maxPriceGap?: number;
  maxTierGap?: number;
  minScore?: number;
  limit?: number;
}

export async function POST(req: Request) {
  const db = getDb();
  let body: GenerateOptions = {};
  try {
    body = (await req.json()) as GenerateOptions;
  } catch {
    body = {};
  }

  const priceBand = body.priceBand ?? 'all';
  const maxPriceGap = body.maxPriceGap ?? 150;
  const maxTierGap = body.maxTierGap ?? 10; // On 0..100 SoC tier scale
  const minScore = body.minScore ?? 55;
  const limit = body.limit ?? 10;

  const socTiers = loadSocTiers();

  // 1. Prefer real collected phones from `phones` table (have verified price_usd & soc)
  const collectedPhones = db
    .prepare(
      `SELECT p.id, p.brand, p.model, p.price_usd, p.soc, p.soc_tier, p.release_date,
              (SELECT count(*) FROM spec_values sv WHERE sv.phone_id = p.id) as spec_count,
              (SELECT count(*) FROM benchmark_scores bs WHERE bs.phone_id = p.id) as bm_count
       FROM phones p
       WHERE p.price_usd IS NOT NULL AND p.price_usd > 0`
    )
    .all() as Array<{
      id: string;
      brand: string;
      model: string;
      price_usd: number;
      soc: string | null;
      soc_tier: number | null;
      release_date: string | null;
      spec_count: number;
      bm_count: number;
    }>;

  // 2. Also include phone_candidates that already have estimated_price_usd recorded
  const candidateRows = db
    .prepare(
      `SELECT id, brand, model, estimated_price_usd, soc_name, announced_date, release_date
       FROM phone_candidates
       WHERE status != 'dismissed' AND estimated_price_usd IS NOT NULL AND estimated_price_usd > 0`
    )
    .all() as Array<{
      id: string;
      brand: string;
      model: string;
      estimated_price_usd: number;
      soc_name: string | null;
      announced_date: string | null;
      release_date: string | null;
    }>;

  const seenKey = new Set<string>();
  const pool: PhoneCandidateForPair[] = [];

  for (const p of collectedPhones) {
    const key = `${p.brand.toLowerCase()}|${p.model.toLowerCase()}`;
    seenKey.add(key);
    const tier = p.soc_tier ?? lookupSocTier(p.soc, socTiers) ?? undefined;
    pool.push({
      id: p.id,
      brand: p.brand,
      model: p.model,
      priceUSD: p.price_usd,
      socTier: tier,
      releaseDate: p.release_date ?? undefined,
      hasSpecs: p.spec_count >= 8,
      hasBenchmarks: p.bm_count > 0,
    });
  }

  for (const c of candidateRows) {
    const key = `${c.brand.toLowerCase()}|${c.model.toLowerCase()}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);
    const tier = lookupSocTier(c.soc_name, socTiers) ?? undefined;
    pool.push({
      id: c.id,
      brand: c.brand,
      model: c.model,
      priceUSD: c.estimated_price_usd,
      socTier: tier,
      releaseDate: c.release_date ?? c.announced_date ?? undefined,
      hasSpecs: false,
      hasBenchmarks: false,
    });
  }

  const candidates = pool.filter((c) => {
    if (priceBand === 'budget') return c.priceUSD <= 350;
    if (priceBand === 'midrange') return c.priceUSD > 350 && c.priceUSD <= 750;
    if (priceBand === 'flagship') return c.priceUSD > 750;
    return true;
  });

  if (candidates.length < 2) {
    return NextResponse.json(
      {
        error: {
          code: 'INSUFFICIENT_CANDIDATES',
          message: `Need at least 2 phones with known USD prices in band "${priceBand}" (found ${candidates.length}). Add phones or collect specs first.`,
        },
        topics: [],
      },
      { status: 400 }
    );
  }

  // Reject pairs already used in comparisons within the last 90 days (MODULES.md §1)
  const recentComparisons = db
    .prepare("SELECT title FROM comparisons WHERE created_at >= date('now', '-90 days')")
    .all() as Array<{ title: string | null }>;
  const recentTitles = new Set(recentComparisons.map((r) => (r.title || '').toLowerCase()));

  const proposed = proposePairs(candidates, minScore);

  const filtered = proposed
    .filter((topic) => {
      const c1 = candidates.find((c) => c.id === topic.phoneIds[0]);
      const c2 = candidates.find((c) => c.id === topic.phoneIds[1]);
      if (!c1 || !c2) return false;

      const pairTitleA = `${topic.phoneNames[0]} vs ${topic.phoneNames[1]}`.toLowerCase();
      const pairTitleB = `${topic.phoneNames[1]} vs ${topic.phoneNames[0]}`.toLowerCase();
      if (recentTitles.has(pairTitleA) || recentTitles.has(pairTitleB)) {
        return false;
      }

      if (maxPriceGap && Math.abs(c1.priceUSD - c2.priceUSD) > maxPriceGap) {
        return false;
      }
      if (maxTierGap !== undefined && c1.socTier !== undefined && c2.socTier !== undefined) {
        if (Math.abs(c1.socTier - c2.socTier) > maxTierGap) {
          return false;
        }
      }
      return true;
    })
    .slice(0, limit);

  let inserted = 0;
  const insertTopic = db.prepare(`
    INSERT OR IGNORE INTO topics (id, phone_ids_json, score, reasons_json, angle, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'proposed', ?)
  `);

  for (const t of filtered) {
    const topicId = ulid();
    const res = insertTopic.run(
      topicId,
      JSON.stringify(t.phoneNames),
      t.score,
      JSON.stringify(t.reasons),
      t.angle,
      new Date().toISOString()
    );
    if (Number(res.changes) > 0) inserted++;
  }

  return NextResponse.json({
    success: true,
    generated: filtered.length,
    newlyInserted: inserted,
    topics: filtered,
  });
}
