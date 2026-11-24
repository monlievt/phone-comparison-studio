// apps/web/src/app/api/topics/research/route.ts
// Real-time YouTube Search Market Demand Radar
// Queries YouTube autocomplete engine (free, no auth) to discover what comparisons real viewers are searching for.

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ulid } from 'ulid';

export interface ResearchSuggestion {
  query: string;
  opponent: string;
  rank: number;        // 1-based position in YouTube autocomplete results
  demandScore: number; // derived ordering score for Gate 0 sorting
  intent: 'generational' | 'rivalry' | 'budget_variant' | 'general';
}

function classifyIntent(basePhone: string, opponent: string): 'generational' | 'rivalry' | 'budget_variant' | 'general' {
  const baseLower = basePhone.toLowerCase();
  const oppLower = opponent.toLowerCase();

  // If opponent contains fe, lite, plus, ultra, pro, mini of same brand
  if (oppLower.includes('fe') || oppLower.includes('lite') || oppLower.includes('plus') || oppLower.includes('ultra')) {
    return 'budget_variant';
  }

  // Check if same brand numbering (e.g. s24 vs s25, iphone 13 vs iphone 14)
  const baseNums = baseLower.match(/\d+/g);
  const oppNums = oppLower.match(/\d+/g);
  if (baseNums && oppNums && baseNums[0] !== oppNums[0]) {
    return 'generational';
  }

  // Cross-brand (e.g. iphone vs samsung, xiaomi vs poco)
  return 'rivalry';
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get('phone')?.trim();

  if (!phone || phone.length < 2) {
    return NextResponse.json({ error: 'Please provide a smartphone name to research' }, { status: 400 });
  }

  try {
    const query = `${phone} vs `;
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) PhoneStudio/1.0',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      return NextResponse.json({
        phone,
        suggestions: [],
        note: 'Could not reach YouTube suggest endpoint',
      });
    }

    const data = await res.json();
    const rawSuggestions: string[] = data[1] || [];

    // Parse and extract the opponent
    const suggestions: ResearchSuggestion[] = rawSuggestions.map((item, index) => {
      const parts = item.split(/\bvs\b/i);
      const opponentRaw = parts.length > 1 ? parts[1].trim() : item;
      const demandScore = Math.max(65, 100 - index * 4);

      return {
        query: item,
        opponent: opponentRaw,
        rank: index + 1,
        demandScore,
        intent: classifyIntent(phone, opponentRaw),
      };
    });

    return NextResponse.json({
      phone,
      totalFound: suggestions.length,
      suggestions,
    });
  } catch (err: unknown) {
    return NextResponse.json({
      phone,
      suggestions: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function POST(req: Request) {
  const db = getDb();
  const { phoneA, phoneB, demandScore, intent, rank } = (await req.json()) as {
    phoneA?: string;
    phoneB?: string;
    demandScore?: number;
    intent?: string;
    rank?: number;
  };

  if (!phoneA || !phoneB) {
    return NextResponse.json({ error: 'phoneA and phoneB are required' }, { status: 400 });
  }

  const topicId = ulid();
  const score = demandScore || 85;
  const rankLabel = rank ? `rank #${rank}` : 'top suggestion';
  const reasons = [
    `YouTube autocomplete ${rankLabel}: "${phoneA} vs ${phoneB}"`,
    intent === 'generational'
      ? 'Generational upgrade comparison (New vs Previous model)'
      : intent === 'budget_variant'
      ? 'Flagship vs Value/Lite variant comparison'
      : 'Cross-brand comparison query on YouTube',
  ];
  const angle = `${phoneA} vs ${phoneB}: YouTube Suggest`;

  db.prepare(`
    INSERT INTO topics (id, phone_ids_json, score, reasons_json, angle, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'proposed', ?)
  `).run(
    topicId,
    JSON.stringify([phoneA, phoneB]),
    score,
    JSON.stringify(reasons),
    angle,
    new Date().toISOString()
  );

  return NextResponse.json({
    success: true,
    topicId,
  });
}
