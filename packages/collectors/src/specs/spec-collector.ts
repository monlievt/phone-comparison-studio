// packages/collectors/src/specs/spec-collector.ts
// Spec Collector: fetches spec page, extracts specs via LLM, verifies numeric integrity, and scores confidence.
// Specification: docs/MODULES.md §2

import Database from 'better-sqlite3';
import { ulid } from 'ulid';
import { LlmRouter, buildSpecExtractPrompt, SpecExtractSchema } from '@phone-studio/ai';
import { PoliteFetcher, extractReadableText } from '../fetcher/index.js';

export interface SpecCollectionInput {
  brand: string;
  model: string;
  variant?: string | null;
  specUrl?: string;
  sourceKind?: 'official' | 'grounded' | 'secondary' | 'manual';
}

export interface SpecCollectionResult {
  phoneId: string;
  brand: string;
  model: string;
  variant?: string | null;
  priceUSD: number | null;
  specs: Record<string, { value: string | null; confidence: number; evidence: string | null }>;
  shape?: any;
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
    const cleanToken = token.replace(/,/g, '');
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
    const phoneId = ulid();
    const now = new Date().toISOString();
    let pageText = '';
    let sourceKind = input.sourceKind ?? 'official';

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

    // 2. Call LLM spec extraction
    const prompt = buildSpecExtractPrompt(
      { brand: input.brand, model: input.model, variant: input.variant },
      pageText,
      DEFAULT_CATEGORY_KEYS
    );

    const llmRes = await this.router.callJson({
      task: 'spec_extract',
      promptId: prompt.promptId,
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      schema: SpecExtractSchema,
      temperature: 0.1,
    });

    const data = llmRes.data;

    // 3. Verification & Confidence calculation
    const specs: Record<string, { value: string | null; confidence: number; evidence: string | null }> = {};

    for (const [key, field] of Object.entries(data.fields)) {
      let confidence = sourceKind === 'official' ? 0.9 : 0.5;

      if (field.value) {
        const verified = verifyNumericTokensInText(field.value, pageText);
        if (!verified) {
          confidence *= 0.4; // Heavily penalize unverified numbers
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

    // 4. Save phone record
    this.db
      .prepare(
        `INSERT OR REPLACE INTO phones (
          id, brand, model, variant, release_date, soc, price_usd, shape_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        phoneId,
        input.brand,
        input.model,
        input.variant ?? null,
        data.phone.releaseDate,
        data.phone.soc,
        data.phone.priceUSD,
        data.shape ? JSON.stringify(data.shape) : null,
        now
      );

    return {
      phoneId,
      brand: input.brand,
      model: input.model,
      variant: input.variant,
      priceUSD: data.phone.priceUSD,
      specs,
      shape: data.shape,
    };
  }
}
