// packages/collectors/src/tracker/tracker-service.ts
// Orchestrates multi-source RSS/Atom + optional Gemini Grounded Search phone discovery
// and upserts candidates into SQLite phone_candidates table.

import { Database } from '@phone-studio/core';
import { LlmRouter } from '@phone-studio/ai';
import { ulid } from 'ulid';
import { z } from 'zod';
import { DiscoveredPhone } from './gsmarena.js';
import { DEFAULT_PHONE_FEEDS, PhoneFeedConfig, fetchFeedCandidates } from './feeds.js';

export interface FeedScanResult {
  id: string;
  label: string;
  found: number;
  error?: string;
}

export interface TrackerSummary {
  gsmarenaFound: number;
  nanoreviewFound: number;
  totalFound: number;
  geminiFound: number;
  inserted: number;
  updated: number;
  feeds: FeedScanResult[];
  geminiError?: string;
  geminiFromCache?: boolean;
}

export interface RunDiscoveryOptions {
  includeRss?: boolean;
  includeGemini?: boolean;
  router?: LlmRouter;
  feeds?: PhoneFeedConfig[];
  skipCache?: boolean;
  /** Custom feed fetcher for unit tests */
  feedFetcher?: typeof fetchFeedCandidates;
}

const GeminiDiscoverySchema = z.object({
  phones: z.array(
    z.object({
      brand: z.string().min(1).max(40),
      model: z.string().min(1).max(60),
      status: z.enum(['announced', 'released']).default('released'),
      announcedDate: z.string().nullable().optional(),
      estimatedPriceUsd: z.number().positive().max(5000).nullable().optional(),
      sourceUrl: z.string().url().nullable().optional(),
    })
  ),
});

export class CandidateTrackerService {
  constructor(private db: Database.Database) {}

  async runDiscovery(opts: RunDiscoveryOptions = {}): Promise<TrackerSummary> {
    const includeRss = opts.includeRss ?? true;
    const includeGemini = opts.includeGemini ?? false;
    const feeds = opts.feeds ?? DEFAULT_PHONE_FEEDS;
    const fetcher = opts.feedFetcher ?? fetchFeedCandidates;

    const summary: TrackerSummary = {
      gsmarenaFound: 0,
      nanoreviewFound: 0,
      totalFound: 0,
      geminiFound: 0,
      inserted: 0,
      updated: 0,
      feeds: [],
    };

    // 1. Fetch all configured RSS/Atom feeds in parallel
    if (includeRss) {
      const results = await Promise.all(feeds.map((feed) => fetcher(feed)));
      for (const result of results) {
        summary.feeds.push({
          id: result.id,
          label: result.label,
          found: result.phones.length,
          ...(result.error ? { error: result.error } : {}),
        });
        if (result.id === 'gsmarena_rss') {
          summary.gsmarenaFound = result.phones.length;
        }
        summary.totalFound += result.phones.length;

        for (const phone of result.phones) {
          this.upsertCandidate(phone, result.id, summary);
        }
      }
    }

    // 2. Optional Gemini Grounded Search discovery (1 LLM call, cached 7 days per MODULES.md §1c)
    if (includeGemini && opts.router) {
      try {
        const now = new Date();
        const yearMonth = now.toISOString().slice(0, 7);
        const llmRes = await opts.router.callJson({
          task: 'discover_recent_phones',
          promptId: `discover_recent_phones@v1:${yearMonth}`,
          requireGrounding: true,
          cacheTtlDays: 7,
          skipCache: opts.skipCache,
          temperature: 0.1,
          schema: GeminiDiscoverySchema,
          systemPrompt:
            'You are a factual smartphone release researcher. Use Google Search grounding to find real smartphones officially announced or released globally in the last 6 months. Never invent unreleased rumors, prices, or URLs. If launch MSRP in USD, date, or official URL is unknown, set it to null. Return strictly valid JSON.',
          userPrompt: `Today is ${now.toISOString().slice(0, 10)}. List 12 to 18 notable smartphones officially announced or released globally in the past 6 months across flagship, mid-range, and budget tiers (brands like Samsung, Apple, Google, Xiaomi, Redmi, POCO, OnePlus, Vivo, iQOO, OPPO, Realme, Motorola, Nothing, Honor, Infinix, Tecno). Output JSON: {"phones":[{"brand":"Samsung","model":"Galaxy S26 Ultra","status":"released","announcedDate":"YYYY-MM-DD or null","estimatedPriceUsd":1299,"sourceUrl":"https://... or null"}]}`,
        });

        summary.geminiFromCache = llmRes.fromCache;
        summary.geminiFound = llmRes.data.phones.length;
        summary.totalFound += llmRes.data.phones.length;

        for (const p of llmRes.data.phones) {
          this.upsertCandidate(
            {
              brand: p.brand.trim(),
              model: p.model.trim(),
              sourceUrl: p.sourceUrl ?? '',
              announcedDate: p.announcedDate ?? undefined,
              estimatedPriceUsd: p.estimatedPriceUsd ?? null,
              status: p.status ?? 'released',
            },
            'gemini_search',
            summary
          );
        }
      } catch (err: unknown) {
        summary.geminiError = err instanceof Error ? err.message : String(err);
      }
    }

    return summary;
  }

  private upsertCandidate(
    phone: DiscoveredPhone,
    source: string,
    summary: TrackerSummary
  ): void {
    const now = new Date().toISOString();
    const existing = this.db
      .prepare('SELECT id, status, estimated_price_usd, source_url FROM phone_candidates WHERE LOWER(brand) = LOWER(?) AND LOWER(model) = LOWER(?)')
      .get(phone.brand, phone.model) as
      | { id: string; status: string; estimated_price_usd: number | null; source_url: string | null }
      | undefined;

    if (existing) {
      const nextStatus = existing.status === 'announced' && phone.status === 'released' ? 'released' : existing.status;
      const nextPrice = existing.estimated_price_usd ?? phone.estimatedPriceUsd ?? null;
      const nextUrl = existing.source_url || phone.sourceUrl || null;
      if (
        nextStatus !== existing.status ||
        nextPrice !== existing.estimated_price_usd ||
        nextUrl !== existing.source_url
      ) {
        this.db
          .prepare('UPDATE phone_candidates SET status = ?, estimated_price_usd = ?, source_url = ?, updated_at = ? WHERE id = ?')
          .run(nextStatus, nextPrice, nextUrl, now, existing.id);
        summary.updated++;
      }
    } else {
      const id = ulid();
      this.db
        .prepare(
          `INSERT INTO phone_candidates (
            id, brand, model, source, source_url, status, announced_date, estimated_price_usd, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          phone.brand,
          phone.model,
          source,
          phone.sourceUrl || null,
          phone.status,
          phone.announcedDate ?? null,
          phone.estimatedPriceUsd ?? null,
          now,
          now
        );
      summary.inserted++;
    }
  }

  /**
   * Retrieves all candidate phones that are ready or released and not dismissed.
   */
  getAvailableCandidates(): Array<{ brand: string; model: string; status: string; source_url: string }> {
    return this.db
      .prepare(
        `SELECT brand, model, status, source_url
         FROM phone_candidates
         WHERE status IN ('announced', 'released', 'ready')
         ORDER BY created_at DESC
         LIMIT 50`
      )
      .all() as Array<{ brand: string; model: string; status: string; source_url: string }>;
  }
}
