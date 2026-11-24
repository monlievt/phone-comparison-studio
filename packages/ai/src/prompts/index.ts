// packages/ai/src/prompts/index.ts
// Prompt definitions, versioned schemas, and template fallbacks.
// Specification: docs/PROMPTS.md

import { z } from 'zod';

// ==========================================
// 1. spec_extract@v1
// ==========================================

export const RawSpecExtractSchema = z.object({
  phone: z.object({
    brand: z.string(),
    model: z.string(),
    variant: z.string().nullable().optional(),
    releaseDate: z.string().nullable().optional(),
    soc: z.string().nullable().optional(),
    priceUSD: z.number().nullable().optional(),
    priceCurrencyOriginal: z.string().nullable().optional(),
    priceOriginal: z.number().nullable().optional(),
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

export type SpecExtract = z.infer<typeof RawSpecExtractSchema>;

export const SpecExtractSchema = z.preprocess((val: any) => {
  if (!val || typeof val !== 'object') return val;

  const res = { ...val };

  // 1. Normalize phone object
  if (typeof res.phone === 'string') {
    res.phone = {
      brand: res.brand ?? '',
      model: res.model ?? res.phone,
      variant: null,
      releaseDate: null,
      soc: null,
      priceUSD: null,
      priceCurrencyOriginal: null,
      priceOriginal: null,
    };
  } else if (!res.phone && (res.brand || res.model)) {
    res.phone = {
      brand: res.brand ?? '',
      model: res.model ?? '',
      variant: res.variant ?? null,
      releaseDate: res.releaseDate ?? null,
      soc: res.soc ?? res.chipset ?? null,
      priceUSD: typeof res.priceUSD === 'number' ? res.priceUSD : null,
      priceCurrencyOriginal: res.priceCurrencyOriginal ?? null,
      priceOriginal: typeof res.priceOriginal === 'number' ? res.priceOriginal : null,
    };
  } else if (res.phone && typeof res.phone === 'object') {
    if (typeof res.phone.priceUSD === 'string') {
      const num = parseFloat(res.phone.priceUSD.replace(/[^0-9.]/g, ''));
      res.phone.priceUSD = isNaN(num) ? null : num;
    }
  }

  // 2. Normalize fields object
  if (!res.fields || typeof res.fields !== 'object') {
    res.fields = {};
    for (const [k, v] of Object.entries(res)) {
      if (k === 'phone' || k === 'shape' || k === 'brand' || k === 'model') continue;
      if (v && typeof v === 'object' && ('value' in v || 'evidence' in v)) {
        res.fields[k] = v;
      } else if (typeof v === 'string' || typeof v === 'number' || v === null) {
        res.fields[k] = { value: v === null ? null : String(v), evidence: null };
      }
    }
  } else {
    // Ensure every field entry has value & evidence
    const normalizedFields: Record<string, any> = {};
    for (const [k, v] of Object.entries(res.fields)) {
      if (v && typeof v === 'object') {
        normalizedFields[k] = {
          value: (v as any).value !== undefined ? ((v as any).value === null ? null : String((v as any).value)) : null,
          evidence: (v as any).evidence !== undefined ? ((v as any).evidence === null ? null : String((v as any).evidence)) : null,
        };
      } else {
        normalizedFields[k] = {
          value: v === null || v === undefined ? null : String(v),
          evidence: null,
        };
      }
    }
    res.fields = normalizedFields;
  }

  // 3. Normalize shape object (LLMs often return null for unknown fields/bodyMM dimensions)
  if (res.shape === null || res.shape === undefined) {
    delete res.shape;
  } else if (typeof res.shape === 'object') {
    const s = res.shape as Record<string, unknown>;
    const rawBody = s.bodyMM as Record<string, unknown> | null | undefined;
    const h = rawBody && typeof rawBody.h === 'number' && Number.isFinite(rawBody.h) ? rawBody.h : null;
    const w = rawBody && typeof rawBody.w === 'number' && Number.isFinite(rawBody.w) ? rawBody.w : null;
    const d = rawBody && typeof rawBody.d === 'number' && Number.isFinite(rawBody.d) ? rawBody.d : null;

    const validFront = new Set(['punch_center', 'punch_left', 'punch_right', 'waterdrop', 'notch', 'pill', 'under_display', 'unknown']);
    const validEdge = new Set(['flat', 'curved', 'dual_curve', 'unknown']);
    const validFrame = new Set(['flat', 'round', 'unknown']);
    const rearNum = typeof s.rearLenses === 'number' && [1, 2, 3, 4].includes(s.rearLenses) ? s.rearLenses : null;

    const rawEvidence = s.evidence && typeof s.evidence === 'object' ? (s.evidence as Record<string, unknown>) : {};
    const cleanEvidence: Record<string, string | null> = {};
    for (const [ek, ev] of Object.entries(rawEvidence)) {
      cleanEvidence[ek] = ev === null || ev === undefined ? null : String(ev);
    }

    res.shape = {
      bodyMM: h !== null && w !== null && d !== null ? { h, w, d } : null,
      screenInch: typeof s.screenInch === 'number' && Number.isFinite(s.screenInch) ? s.screenInch : null,
      aspect: typeof s.aspect === 'number' && Number.isFinite(s.aspect) ? s.aspect : null,
      frontCamera: typeof s.frontCamera === 'string' && validFront.has(s.frontCamera) ? s.frontCamera : 'unknown',
      edge: typeof s.edge === 'string' && validEdge.has(s.edge) ? s.edge : 'unknown',
      frame: typeof s.frame === 'string' && validFrame.has(s.frame) ? s.frame : 'unknown',
      rearLenses: rearNum,
      evidence: cleanEvidence,
    };
  }

  return res;
}, RawSpecExtractSchema) as unknown as typeof RawSpecExtractSchema;

export function buildSpecExtractPrompt(
  phone: { brand: string; model: string; variant?: string | null },
  pageText: string,
  fields: string[],
  useGroundedSearch = false
) {
  const sourceRule = pageText
    ? 'Extract ONLY from the supplied PAGE TEXT below. If a spec is not stated in the text, set value to null and evidence to null.'
    : useGroundedSearch
    ? 'Use Google Search grounding to look up official published technical specifications for this smartphone. For each field found in search results, provide the exact value and a short verbatim evidence snippet (or source name + fact). Never invent or guess; if a spec is not found in search results, set value to null and evidence to null.'
    : 'No page text is provided. Return null for every field; never guess from memory.';

  const systemPrompt = `You extract verified smartphone specifications into valid JSON.
${sourceRule}
CRITICAL: Output strictly valid JSON matching this structure:
{
  "phone": {
    "brand": "${phone.brand}",
    "model": "${phone.model}",
    "variant": null,
    "releaseDate": "YYYY-MM-DD or null",
    "soc": "chipset name or null",
    "priceUSD": 499,
    "priceCurrencyOriginal": "USD",
    "priceOriginal": 499
  },
  "fields": {
    "display_type": { "value": "e.g. LTPO4 AMOLED", "evidence": "short factual snippet from source" },
    "chipset": { "value": "e.g. Snapdragon 8 Gen 2", "evidence": "short factual snippet from source" }
  },
  "shape": {
    "bodyMM": { "h": 163.3, "w": 75.3, "d": 8.8 },
    "screenInch": 6.78,
    "frontCamera": "punch_center",
    "edge": "curved",
    "frame": "flat",
    "rearLenses": 3
  }
}
For software_support, specify the promised update duration in years if officially stated (e.g. "6 years OS updates" or "2 years OS updates"), or null if unannounced. For price, provide launch MSRP in USD (e.g. "$129") if available. Output JSON only.`;

  const userPrompt = `PHONE: ${phone.brand} ${phone.model} ${phone.variant ?? ''}
FIELDS TO EXTRACT: ${fields.join(', ')}

${
  pageText
    ? `PAGE TEXT:\n${pageText.slice(0, 12000)}`
    : useGroundedSearch
    ? `Use Google Search grounding to find official specifications for "${phone.brand} ${phone.model} ${phone.variant ?? ''}". Include all requested fields in "fields" with factual values and short evidence snippets.`
    : 'PAGE TEXT:\nNO PAGE TEXT PROVIDED. Return null for every field.'
}`;

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

export const RawCopyAllSchema = z.object({
  titles: z.array(z.string()).min(1).max(5),
  shortTitles: z.array(z.string()).min(1).max(3),
  hook: z.string().max(40),
  description: z.string(),
  tags: z.array(z.string()).min(3).max(15),
  hashtags: z.array(z.string()).max(3),
  categoryNotes: z.record(z.string()).optional(),
});

export type CopyAll = z.infer<typeof RawCopyAllSchema>;

export const CopyAllSchema = z.preprocess((val: any) => {
  if (!val || typeof val !== 'object') return val;

  const res = { ...val };

  // Normalize titles
  if (typeof res.titles === 'string') {
    res.titles = [res.titles.slice(0, 60)];
  } else if (Array.isArray(res.titles)) {
    res.titles = res.titles.map((t: any) => String(t).slice(0, 60)).slice(0, 5);
  } else {
    res.titles = ['Phone Comparison (2026)'];
  }

  // Normalize shortTitles
  if (typeof res.shortTitles === 'string') {
    res.shortTitles = [res.shortTitles.slice(0, 50)];
  } else if (Array.isArray(res.shortTitles)) {
    res.shortTitles = res.shortTitles.map((t: any) => String(t).slice(0, 50)).slice(0, 3);
  } else {
    res.shortTitles = [res.titles[0]?.slice(0, 50) ?? 'Comparison'];
  }

  // Normalize hook (ensure <= 40 chars)
  if (typeof res.hook === 'string') {
    res.hook = res.hook.trim().slice(0, 40);
  } else {
    res.hook = 'Who wins this battle?';
  }

  // Normalize description
  if (!res.description && (res.desc || res.summary)) {
    res.description = String(res.desc || res.summary);
  } else if (typeof res.description !== 'string') {
    res.description = 'Head to head smartphone comparison.';
  }

  // Normalize tags
  if (typeof res.tags === 'string') {
    res.tags = res.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
  } else if (!Array.isArray(res.tags)) {
    res.tags = ['phone comparison', 'smartphone', 'review'];
  }
  if (res.tags.length < 3) {
    res.tags.push('phone comparison', 'smartphone specs', 'tech');
  }
  res.tags = res.tags.slice(0, 15);

  // Normalize hashtags (ensure <= 3 items)
  if (typeof res.hashtags === 'string') {
    res.hashtags = res.hashtags.split(' ').map((h: string) => h.trim()).filter(Boolean);
  } else if (!Array.isArray(res.hashtags)) {
    res.hashtags = ['#smartphone', '#tech'];
  }
  res.hashtags = res.hashtags.slice(0, 3);

  return res;
}, RawCopyAllSchema) as unknown as typeof RawCopyAllSchema;

export function buildCopyAllPrompt(summary: {
  phones: Array<{ name: string; priceUSD?: number }>;
  categories: Array<{ key: string; label: string; winnerNames: string[]; tie: boolean }>;
  overall?: { winnerName: string; tie: boolean; points?: number[] };
  benchmarks?: Array<{ title: string; winnerName: string }>;
}) {
  const phoneNames = summary.phones.map((p) => p.name).join(' vs ');
  const systemPrompt = `You write short English YouTube copy for a phone comparison video. Use ONLY facts and numbers present in the input. No clickbait lies or banned superlatives ("best ever", "destroys", "crushes", "kills"). Titles <= 60 characters. Hook <= 40 characters. Max 3 hashtags.
Output strictly valid JSON matching this schema:
{
  "titles": ["${phoneNames}: Which Wins? (2026)", "${phoneNames} Specs Comparison"],
  "shortTitles": ["${phoneNames}"],
  "hook": "Same price. Who wins?",
  "description": "Full head-to-head comparison between ${phoneNames}. All specifications from verified data.",
  "tags": ["${summary.phones[0]?.name.toLowerCase()}", "${summary.phones[1]?.name?.toLowerCase() ?? 'phone'}", "phone comparison", "smartphone specs", "tech"],
  "hashtags": ["#phonecomparison", "#tech", "#smartphone"]
}
Output JSON only.`;
  const userPrompt = `DATA:\n${JSON.stringify(summary, null, 2)}`;
  return { systemPrompt, userPrompt, promptId: 'copy_all@v1' };
}

export const BANNED_COPY_WORDS = ['best ever', 'destroys', 'crushes', 'obliterates', 'kills', 'unbeatable'];

/**
 * Checks copy compliance per PROMPTS.md §3: banned words, title length <= 60, hook <= 40.
 * (Numeric truthfulness is checked separately with validateNumbers from @phone-studio/core.)
 */
export function checkCopyRules(copy: CopyAll): string[] {
  const issues: string[] = [];
  for (const title of copy.titles) {
    if (title.length > 60) {
      issues.push(`Title exceeds 60 chars (${title.length}): "${title}"`);
    }
  }
  if (copy.hook.length > 40) {
    issues.push(`Hook exceeds 40 chars (${copy.hook.length}): "${copy.hook}"`);
  }

  const allText = [...copy.titles, ...copy.shortTitles, copy.hook, copy.description].join(' ').toLowerCase();
  for (const word of BANNED_COPY_WORDS) {
    if (allText.includes(word)) {
      issues.push(`Copy contains banned superlative/clickbait phrase: "${word}"`);
    }
  }
  return issues;
}

/**
 * Ensures every Short title ends with " #Shorts" added deterministically by code (PROMPTS.md §3).
 */
export function ensureShortsSuffix(shortTitles: string[]): string[] {
  return shortTitles.map((t) => {
    const cleaned = t.replace(/\s*#shorts\s*$/i, '').trim();
    return `${cleaned} #Shorts`;
  });
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

  const prices = phones.map((p) => p.priceUSD).filter((p): p is number => typeof p === 'number' && p > 0);
  const samePrice = prices.length >= 2 && prices.every((p) => p === prices[0]);
  const hook = samePrice
    ? `THE $${prices[0]} FLAGSHIP SHOWDOWN`
    : `FLAGSHIP SHOWDOWN: WHO WINS?`;

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
    hook,
    description,
    tags,
    hashtags: ['#phonecomparison', '#tech', '#smartphone'],
  };
}

/**
 * Formats a rich, professional YouTube description with timecodes, chapters,
 * key spec highlights, data integrity notice, and hashtags.
 */
export function formatFullYouTubeDescription(opts: {
  introDescription: string;
  phones: Array<{ name: string; priceUSD?: number; hasImage?: boolean }>;
  categories?: Array<{ key: string; label: string; values: Array<{ primary: string; secondary?: string }> }>;
  benchmarks?: Array<{ title: string }>;
  credits?: string[];
  hook?: string;
  hashtags?: string[];
}): string {
  const lines: string[] = [];

  // 1. Editorial Intro Narrative
  lines.push(opts.introDescription.trim());
  lines.push('');

  // 2. Specification Highlights
  if (opts.categories && opts.categories.length > 0) {
    lines.push('KEY SPECIFICATION BATTLE:');
    const priceLine = opts.phones.map((p) => `${p.name}: ${p.priceUSD ? `$${p.priceUSD}` : 'N/A'}`).join(' vs ');
    lines.push(`• Launch Price: ${priceLine}`);

    const chipsetCat = opts.categories.find((c) => c.key === 'chipset' || c.key === 'soc');
    if (chipsetCat) {
      const valStr = chipsetCat.values.map((v, i) => `${opts.phones[i]?.name ?? ''} (${v.primary})`).join(' vs ');
      lines.push(`• Chipset: ${valStr}`);
    }

    const batteryCat = opts.categories.find((c) => c.key === 'battery');
    if (batteryCat) {
      const valStr = batteryCat.values.map((v, i) => `${opts.phones[i]?.name ?? ''} (${v.primary})`).join(' vs ');
      lines.push(`• Battery: ${valStr}`);
    }

    const cameraCat = opts.categories.find((c) => c.key === 'main_camera' || c.key === 'camera');
    if (cameraCat) {
      const valStr = cameraCat.values.map((v, i) => `${opts.phones[i]?.name ?? ''} (${v.primary})`).join(' vs ');
      lines.push(`• Main Camera: ${valStr}`);
    }
    lines.push('');

    // 3. YouTube Timecode Chapters (Must start at 00:00)
    lines.push('TIMECODES:');
    lines.push('00:00 - Introduction');

    let currentSec = 5; // Intro is 5 seconds
    const formatTime = (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    for (const cat of opts.categories) {
      lines.push(`${formatTime(currentSec)} - ${cat.label}`);
      const longest = Math.max(...cat.values.flatMap((v) => [v.primary.length, v.secondary?.length ?? 0]));
      const segSec = (opts.phones.length >= 3 ? 7 : 6) + (longest > 16 ? 1 : 0) + (longest > 28 ? 1 : 0);
      currentSec += segSec;
    }

    for (const bm of opts.benchmarks ?? []) {
      lines.push(`${formatTime(currentSec)} - ${bm.title}`);
      currentSec += 8;
    }

    lines.push(`${formatTime(currentSec)} - Final Score Recap`);
    currentSec += 8;
    lines.push(`${formatTime(currentSec)} - Overall Winner & Verdict`);
    lines.push('');
  }

  // 4. Data Sources, Illustration Notice & Credits
  lines.push('DATA INTEGRITY & CREDITS:');
  lines.push('Rankings and scores are computed deterministically by code from verified spec data.');
  if (opts.phones.some((p) => !p.hasImage)) {
    lines.push('Device visuals shown are parametric illustrations generated from published dimensions.');
  }
  if (opts.credits && opts.credits.length > 0) {
    lines.push(`Data sources & credits: ${opts.credits.join(' | ')}`);
  }
  lines.push('');

  // 5. Hashtags
  if (opts.hashtags && opts.hashtags.length > 0) {
    lines.push(opts.hashtags.slice(0, 3).join(' '));
  } else {
    const defaultTags = ['#PhoneComparison', '#Tech', '#Smartphones'];
    lines.push(defaultTags.join(' '));
  }

  return lines.join('\n');
}

