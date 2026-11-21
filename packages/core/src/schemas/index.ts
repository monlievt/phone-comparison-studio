// packages/core/src/schemas/index.ts
// Zod schemas for all core domain types.
// Keep in sync with DATA_MODEL.md.

import { z } from 'zod';

// --- IDs ---
export const UlidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Must be a valid ULID');

// --- Comparison status ---
export const ComparisonStatusSchema = z.enum([
  'CREATED',
  'COLLECTED',
  'GATE_A',
  'DATA_APPROVED',
  'COPY_READY',
  'PREVIEW_RENDERED',
  'GATE_B',
  'VIDEO_APPROVED',
  'FINAL_RENDERED',
  'METADATA_READY',
  'HANDED_OFF',
  'PUBLISHED',
  'FAILED',
  'SKIPPED_LOW_DATA',
]);
export type ComparisonStatus = z.infer<typeof ComparisonStatusSchema>;

// --- Job state ---
export const JobStateSchema = z.enum(['queued', 'running', 'done', 'failed', 'blocked']);
export type JobState = z.infer<typeof JobStateSchema>;

export const JobTypeSchema = z.enum([
  'track_candidates',
  'find_topics',
  'collect_specs',
  'collect_images',
  'compute_verdict',
  'generate_copy',
  'render_preview',
  'render_final',
  'render_thumbnail',
  'handoff',
]);
export type JobType = z.infer<typeof JobTypeSchema>;

// --- Phone Candidate (Auto Discovery) ---
export const CandidateSourceSchema = z.enum([
  'gsmarena_rss',
  'nanoreview',
  'gemini_search',
  'manual',
]);
export type CandidateSource = z.infer<typeof CandidateSourceSchema>;

export const CandidateStatusSchema = z.enum([
  'announced',
  'released',
  'ready',
  'dismissed',
]);
export type CandidateStatus = z.infer<typeof CandidateStatusSchema>;

export const PhoneCandidateSchema = z.object({
  id: z.string(),
  brand: z.string(),
  model: z.string(),
  variant: z.string().nullable().optional(),
  source: CandidateSourceSchema,
  sourceUrl: z.string().url().nullable().optional(),
  status: CandidateStatusSchema.default('announced'),
  announcedDate: z.string().nullable().optional(),
  releaseDate: z.string().nullable().optional(),
  estimatedPriceUSD: z.number().nullable().optional(),
  socName: z.string().nullable().optional(),
  rawPayload: z.record(z.any()).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PhoneCandidate = z.infer<typeof PhoneCandidateSchema>;

// --- Source kinds ---
export const SourceKindSchema = z.enum(['official', 'grounded', 'manual', 'secondary']);
export type SourceKind = z.infer<typeof SourceKindSchema>;

// --- Image status ---
export const ImageStatusSchema = z.enum(['ok', 'blocked', 'missing']);
export type ImageStatus = z.infer<typeof ImageStatusSchema>;

// --- Topic status ---
export const TopicStatusSchema = z.enum(['proposed', 'approved', 'rejected', 'used']);
export type TopicStatus = z.infer<typeof TopicStatusSchema>;

// --- PhoneShape ---
export const FrontCameraStyleSchema = z.enum([
  'punch_center',
  'punch_left',
  'punch_right',
  'waterdrop',
  'notch',
  'pill',
  'under_display',
  'unknown',
]);

export const PhoneShapeSchema = z.object({
  bodyMM: z.object({ h: z.number(), w: z.number(), d: z.number() }).nullable(),
  screenInch: z.number().nullable(),
  aspect: z.number().nullable(),
  frontCamera: FrontCameraStyleSchema,
  edge: z.enum(['flat', 'curved', 'dual_curve', 'unknown']),
  frame: z.enum(['flat', 'round', 'unknown']),
  rearLenses: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable(),
  evidence: z.record(z.string().nullable()),
});
export type PhoneShape = z.infer<typeof PhoneShapeSchema>;

// --- Render contract (Comparison) ---
export const PhoneImageSchema = z.object({
  src: z.string(),
  license: z.string().min(1, 'License is required'),
  sourceUrl: z.string().url(),
  accessedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  author: z.string().optional(),
});

export const PhoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color'),
  priceUSD: z.number().positive().optional(),
  image: PhoneImageSchema.optional(),
  soc: z.string().optional(),
  releaseDate: z.string().optional(),
  priceNote: z.string().optional(),
});

export const CategoryValueSchema = z.object({
  primary: z.string(),
  secondary: z.string().optional(),
});

export const CategorySchema = z.object({
  key: z.string(),
  label: z.string(),
  values: z.array(CategoryValueSchema),
  ranking: z.array(z.number().int().positive()),
  weight: z.number().optional(),
});

export const BenchmarkScoreSetSchema = z.object({
  main: z.number(),
  parts: z.record(z.number()),
});

export const BenchmarkPartSchema = z.object({
  key: z.string(),
  label: z.string(),
});

export const BenchmarkDataSchema = z.object({
  id: z.string(),
  source: z.string(),
  title: z.string(),
  version: z.string(),
  updated: z.string(),
  sourceUrl: z.string().url(),
  note: z.string().optional(),
  subtitle: z.string().optional(),
  parts: z.array(BenchmarkPartSchema).max(4),
  scores: z.array(BenchmarkScoreSetSchema.nullable()),
  lowerIsBetter: z.boolean().optional(),
});

export const ComparisonSchema = z.object({
  id: z.string(),
  phones: z.array(PhoneSchema).min(2).max(3),
  categories: z.array(CategorySchema),
  benchmarks: z.array(BenchmarkDataSchema).optional(),
  title: z.string().optional(),
  market: z.literal('global'),
  currency: z.literal('USD'),
  overall: z.object({
    ranking: z.array(z.number()),
    points: z.array(z.number()),
  }).optional(),
  hook: z.string().max(40).optional(),
  labels: z.record(z.string()).optional(),
  credits: z.array(z.string()),
});
export type ComparisonInput = z.infer<typeof ComparisonSchema>;

// --- Validation helpers ---

/**
 * validateComparison: enforces invariants from DATA_MODEL.md §3.
 * Returns array of error messages; empty = valid.
 */
export function validateComparison(c: ComparisonInput): string[] {
  const errors: string[] = [];
  const n = c.phones.length;

  for (const cat of c.categories) {
    if (cat.values.length !== n) {
      errors.push(`Category "${cat.key}": values.length (${cat.values.length}) !== phones.length (${n})`);
    }
    if (cat.ranking.length !== n) {
      errors.push(`Category "${cat.key}": ranking.length (${cat.ranking.length}) !== phones.length (${n})`);
    }
    if (!cat.ranking.includes(1)) {
      errors.push(`Category "${cat.key}": no rank 1 in ranking`);
    }
  }

  for (const bm of c.benchmarks ?? []) {
    if (bm.scores.length !== n) {
      errors.push(`Benchmark "${bm.id}": scores.length (${bm.scores.length}) !== phones.length (${n})`);
    }
    if (bm.parts.length > 4) {
      errors.push(`Benchmark "${bm.id}": parts.length (${bm.parts.length}) > 4`);
    }
  }

  for (const phone of c.phones) {
    if (phone.image && !phone.image.license) {
      errors.push(`Phone "${phone.id}": image.license is required`);
    }
  }

  return errors;
}

/**
 * validateNumbers: every number token in copy strings must appear in the comparison data.
 * Returns list of offending {token, context} pairs.
 */
export function validateNumbers(
  c: ComparisonInput,
  copyStrings: string[]
): Array<{ token: string; context: string }> {
  // Collect all numeric tokens from the data
  const dataNumbers = new Set<string>();

  for (const cat of c.categories) {
    for (const v of cat.values) {
      extractNumbers(v.primary).forEach((n) => dataNumbers.add(n));
      if (v.secondary) extractNumbers(v.secondary).forEach((n) => dataNumbers.add(n));
    }
  }

  for (const phone of c.phones) {
    if (phone.priceUSD !== undefined) dataNumbers.add(String(phone.priceUSD));
  }

  for (const bm of c.benchmarks ?? []) {
    for (const score of bm.scores) {
      if (!score) continue;
      extractNumbers(String(score.main)).forEach((n) => dataNumbers.add(n));
      Object.values(score.parts).forEach((p) => extractNumbers(String(p)).forEach((n) => dataNumbers.add(n)));
    }
  }

  const offenders: Array<{ token: string; context: string }> = [];

  for (const copy of copyStrings) {
    for (const token of extractNumbers(copy)) {
      if (!dataNumbers.has(token)) {
        offenders.push({ token, context: copy.slice(0, 80) });
      }
    }
  }

  return offenders;
}

/** Extract numeric tokens (integers and decimals) from a string */
function extractNumbers(s: string): string[] {
  return (s.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/,/g, ''));
}
