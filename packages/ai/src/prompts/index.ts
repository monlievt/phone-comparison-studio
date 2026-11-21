// packages/ai/src/prompts/index.ts
// Prompt definitions, versioned schemas, and template fallbacks.
// Specification: docs/PROMPTS.md

import { z } from 'zod';

// ==========================================
// 1. spec_extract@v1
// ==========================================

export const SpecExtractSchema = z.object({
  phone: z.object({
    brand: z.string(),
    model: z.string(),
    variant: z.string().nullable(),
    releaseDate: z.string().nullable(),
    soc: z.string().nullable(),
    priceUSD: z.number().nullable(),
    priceCurrencyOriginal: z.string().nullable(),
    priceOriginal: z.number().nullable(),
  }),
  fields: z.record(
    z.object({
      value: z.string().nullable(),
      evidence: z.string().nullable(),
    })
  ),
  shape: z.object({
    bodyMM: z.object({ h: z.number(), w: z.number(), d: z.number() }).nullable().optional(),
    screenInch: z.number().nullable().optional(),
    aspect: z.number().nullable().optional(),
    frontCamera: z.enum([
      'punch_center',
      'punch_left',
      'punch_right',
      'waterdrop',
      'notch',
      'pill',
      'under_display',
      'unknown',
    ]).optional(),
    edge: z.enum(['flat', 'curved', 'dual_curve', 'unknown']).optional(),
    frame: z.enum(['flat', 'round', 'unknown']).optional(),
    rearLenses: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable().optional(),
  }).optional(),
});
export type SpecExtract = z.infer<typeof SpecExtractSchema>;

export function buildSpecExtractPrompt(phone: { brand: string; model: string; variant?: string | null }, pageText: string, fields: string[]) {
  const systemPrompt = `You extract phone specifications from the supplied page text. Use ONLY the text. If a value is not stated, return null. Never guess or use outside knowledge. For each field return the value and a verbatim evidence snippet (max 20 words) copied from the text. Output JSON only matching the schema.`;
  const userPrompt = `PHONE: ${phone.brand} ${phone.model} ${phone.variant ?? ''}\nTEXT:\n${pageText.slice(0, 12000)}\nFIELDS TO EXTRACT: ${fields.join(', ')}`;
  return { systemPrompt, userPrompt, promptId: 'spec_extract@v1' };
}

// ==========================================
// 2. pair_propose@v1
// ==========================================

export const PairProposeSchema = z.object({
  phones: z.array(
    z.object({
      brand: z.string(),
      model: z.string(),
      variant: z.string().nullable().optional(),
      approxPriceUSD: z.number().nullable().optional(),
      soc: z.string().nullable().optional(),
      sourceUrl: z.string().optional(),
    })
  ),
});
export type PairPropose = z.infer<typeof PairProposeSchema>;

export function buildPairProposePrompt(priceMinUSD: number, priceMaxUSD: number) {
  const systemPrompt = `List smartphones launched in the last 12 months. Use web search if available. Return only real models you can cite; each with official page URL. If unsure, omit. Output JSON only.`;
  const userPrompt = `Find popular smartphones released in the last 12 months with launch price between $${priceMinUSD} and $${priceMaxUSD} USD.`;
  return { systemPrompt, userPrompt, promptId: 'pair_propose@v1' };
}

// ==========================================
// 3. copy_all@v1
// ==========================================

export const CopyAllSchema = z.object({
  titles: z.array(z.string()).min(1).max(5),
  shortTitles: z.array(z.string()).min(1).max(3),
  hook: z.string().max(40),
  description: z.string(),
  tags: z.array(z.string()).min(5).max(15),
  hashtags: z.array(z.string()).max(3),
  categoryNotes: z.record(z.string()).optional(),
});
export type CopyAll = z.infer<typeof CopyAllSchema>;

export function buildCopyAllPrompt(summary: {
  phones: Array<{ name: string; priceUSD?: number }>;
  categories: Array<{ key: string; label: string; winnerNames: string[]; tie: boolean }>;
  overall?: { winnerName: string; tie: boolean };
}) {
  const systemPrompt = `You write short English YouTube copy for a phone comparison channel. Use ONLY facts and numbers present in the input. No superlatives unless the input shows a clear winner. No clickbait lies. Titles <= 60 characters. Output JSON only.`;
  const userPrompt = `DATA:\n${JSON.stringify(summary, null, 2)}`;
  return { systemPrompt, userPrompt, promptId: 'copy_all@v1' };
}

// ==========================================
// 4. Template Copy Fallback (Code / Non-AI)
// ==========================================

export function generateTemplateCopy(phones: Array<{ name: string; priceUSD?: number }>, winnerName?: string): CopyAll {
  const year = new Date().getFullYear();
  const phoneNames = phones.map((p) => p.name).join(' vs ');

  const title = phones.length === 2
    ? `${phones[0].name} vs ${phones[1].name}: Which Wins? (${year})`
    : `${phoneNames}: Ultimate Comparison (${year})`;

  const shortTitle = `${phones[0].name} vs ${phones[1].name}`;

  const priceNotes = phones
    .map((p) => `${p.name}: ${p.priceUSD ? `$${p.priceUSD}` : 'N/A'}`)
    .join(' | ');

  const description = `Detailed head-to-head comparison of ${phoneNames}.\n\nLaunch prices: ${priceNotes}.\n\nAll specifications are collected directly from manufacturer technical sheets.`;

  const tags = [
    ...phones.map((p) => p.name.toLowerCase()),
    'phone comparison',
    'smartphone specs',
    'which to buy',
    `${year} phones`,
    winnerName ? `${winnerName.toLowerCase()} winner` : 'phone review',
  ].slice(0, 12);

  return {
    titles: [title.slice(0, 60)],
    shortTitles: [shortTitle.slice(0, 50)],
    hook: 'Same price. Who wins?',
    description,
    tags,
    hashtags: ['#phonecomparison', '#tech', '#smartphone'],
  };
}
