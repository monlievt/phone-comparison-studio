// packages/collectors/src/specs/spec-collector.ts
// Spec Collector: fetches spec page, extracts specs via LLM, verifies numeric integrity, and scores confidence.
// Specification: docs/MODULES.md §2

import { Database } from '@phone-studio/core';
import { ulid } from 'ulid';
import { LlmRouter, buildSpecExtractPrompt, SpecExtractSchema } from '@phone-studio/ai';
import { PoliteFetcher, extractReadableText } from '../fetcher/index.js';

export interface SpecCollectionInput {
  brand: string;
  model: string;
  variant?: string | null;
  specUrl?: string;
  sourceKind?: 'official' | 'grounded' | 'secondary' | 'manual';
  forceRefresh?: boolean;
}

export interface SpecCollectionResult {
  phoneId: string;
  brand: string;
  model: string;
  variant?: string | null;
  priceUSD: number | null;
  specs: Record<string, { value: string | null; confidence: number; evidence: string | null }>;
  shape?: Record<string, unknown> | null;
  fromCache?: boolean;
}

const DEFAULT_CATEGORY_KEYS = [
  'display_type',
  'resolution',
  'refresh_rate',
  'peak_brightness',
  'chipset',
  'ram',
  'storage',
  'battery',
  'charging',
  'main_camera',
  'selfie_camera',
  'video_recording',
  'weight',
  'ip_rating',
  'software_support',
  'price',
];

/**
 * Checks if all numeric tokens in the extracted value exist in the raw source text.
 */
export function verifyNumericTokensInText(value: string | null, sourceText: string): boolean {
  if (!value) return true;
  const tokens = value.match(/\d[\d,.]*/g) ?? [];
  const normalizedSource = sourceText.replace(/,/g, '');

  for (const token of tokens) {
    const cleanToken = token.replace(/,/g, '').replace(/\.+$/, '');
    if (!cleanToken) continue;
    if (!normalizedSource.includes(cleanToken)) {
      return false; // Fabricated or hallucinated number
    }
  }
  return true;
}

export class SpecCollector {
  private fetcher: PoliteFetcher;

  constructor(
    private db: Database.Database,
    private router: LlmRouter,
    fetcher?: PoliteFetcher
  ) {
    this.fetcher = fetcher ?? new PoliteFetcher();
  }

  async collect(input: SpecCollectionInput): Promise<SpecCollectionResult> {
    const existingPhone = this.db
      .prepare(
        `SELECT id, brand, model, variant, price_usd, shape_json, created_at
         FROM phones
         WHERE LOWER(brand) = LOWER(?) AND LOWER(model) = LOWER(?)
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(input.brand, input.model) as
      | {
          id: string;
          brand: string;
          model: string;
          variant: string | null;
          price_usd: number | null;
          shape_json: string | null;
          created_at: string;
        }
      | undefined;

    // Hard Rule #9: cache spec results per phone (30-day TTL) unless forceRefresh is explicitly requested
    if (existingPhone && !input.forceRefresh) {
      const existingSpecs = this.db
        .prepare('SELECT category_key, raw_value, confidence, fetched_at FROM spec_values WHERE phone_id = ?')
        .all(existingPhone.id) as Array<{
        category_key: string;
        raw_value: string | null;
        confidence: number | null;
        fetched_at: string | null;
      }>;

      const newestFetchMs = existingSpecs.reduce((max, s) => {
        const ms = s.fetched_at ? Date.parse(s.fetched_at) : 0;
        return Number.isNaN(ms) ? max : Math.max(max, ms);
      }, 0);
      const ageDays = newestFetchMs > 0 ? (Date.now() - newestFetchMs) / (1000 * 60 * 60 * 24) : 999;

      if (existingSpecs.length >= 6 && ageDays <= 30) {
        const specsMap: Record<string, { value: string | null; confidence: number; evidence: string | null }> = {};
        for (const s of existingSpecs) {
          specsMap[s.category_key] = {
            value: s.raw_value,
            confidence: s.confidence ?? 0,
            evidence: null,
          };
        }
        return {
          phoneId: existingPhone.id,
          brand: existingPhone.brand,
          model: existingPhone.model,
          variant: existingPhone.variant,
          priceUSD: existingPhone.price_usd,
          specs: specsMap,
          shape: existingPhone.shape_json ? (JSON.parse(existingPhone.shape_json) as Record<string, unknown>) : null,
          fromCache: true,
        };
      }
    }

    const phoneId = existingPhone?.id ?? ulid();
    const now = new Date().toISOString();
    let pageText = '';
    let sourceKind = input.sourceKind ?? (input.specUrl ? 'official' : 'grounded');

    // 1. Fetch text if URL is available
    if (input.specUrl) {
      try {
        const html = await this.fetcher.fetch(input.specUrl);
        pageText = extractReadableText(html);
      } catch (err) {
        console.warn(`[spec-collector] Failed to fetch URL ${input.specUrl}:`, err);
        sourceKind = 'secondary';
      }
    }

    // 2. Call LLM spec extraction (enable Google Search grounding when no official spec page text is present)
    const prompt = buildSpecExtractPrompt(
      { brand: input.brand, model: input.model, variant: input.variant },
      pageText,
      DEFAULT_CATEGORY_KEYS,
      !pageText
    );

    const llmRes = await this.router.callJson({
      task: 'spec_extract',
      promptId: prompt.promptId,
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      schema: SpecExtractSchema,
      temperature: 0.1,
      requireGrounding: !pageText,
      skipCache: Boolean(input.forceRefresh),
    });

    const data = llmRes.data;

    // 3. Upsert phone record (reuses existing phoneId to avoid duplicate rows)
    if (existingPhone) {
      this.db
        .prepare(
          `UPDATE phones
           SET variant = COALESCE(?, variant),
               release_date = COALESCE(?, release_date),
               soc = COALESCE(?, soc),
               price_usd = COALESCE(?, price_usd),
               shape_json = COALESCE(?, shape_json)
           WHERE id = ?`
        )
        .run(
          input.variant ?? null,
          data.phone.releaseDate ?? null,
          data.phone.soc ?? null,
          data.phone.priceUSD ?? null,
          data.shape ? JSON.stringify(data.shape) : null,
          phoneId
        );
    } else {
      this.db
        .prepare(
          `INSERT INTO phones (
            id, brand, model, variant, release_date, soc, price_usd, shape_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          phoneId,
          input.brand,
          input.model,
          input.variant ?? null,
          data.phone.releaseDate ?? null,
          data.phone.soc ?? null,
          data.phone.priceUSD ?? null,
          data.shape ? JSON.stringify(data.shape) : null,
          now
        );
    }

    // 4. Verification & Confidence calculation & Save spec_values
    const specs: Record<string, { value: string | null; confidence: number; evidence: string | null }> = {};

    for (const [key, field] of Object.entries(data.fields)) {
      let confidence = 0;

      if (field.value) {
        confidence = sourceKind === 'official' ? 0.9 : sourceKind === 'grounded' ? 0.7 : 0.5;
        if (pageText) {
          const verified = verifyNumericTokensInText(field.value, pageText);
          if (!verified) {
            confidence *= 0.4; // Heavily penalize unverified numbers against fetched official text
          }
        } else if (sourceKind === 'grounded') {
          // Grounded search without direct HTML fetch: require evidence snippet to stay at amber 0.7, else flag 0.45
          confidence = field.evidence && field.evidence.trim().length > 0 ? 0.7 : 0.45;
        } else {
          // Unverified without pageText or grounding
          confidence *= 0.4;
        }
      }

      specs[key] = {
        value: field.value,
        confidence,
        evidence: field.evidence,
      };

      // Save to SQLite spec_values table
      this.db
        .prepare(
          `INSERT OR REPLACE INTO spec_values (
            id, phone_id, category_key, raw_value, source_url, source_kind, fetched_at, confidence
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          ulid(),
          phoneId,
          key,
          field.value,
          input.specUrl ?? null,
          sourceKind,
          now,
          confidence
        );
    }

    return {
      phoneId,
      brand: input.brand,
      model: input.model,
      variant: input.variant,
      priceUSD: data.phone.priceUSD ?? null,
      specs,
      shape: data.shape,
    };
  }
}
