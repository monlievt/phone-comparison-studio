// packages/core/src/verdict.ts
// Pure code verdict engine. AI never decides winners.
// Specification: docs/VERDICT_RULES.md

export type ComparisonRule = 'higher' | 'lower' | 'ordinal';

export interface CategoryRuleConfig {
  key: string;
  rule: ComparisonRule;
  tieEps: number; // absolute value or percentage (e.g. 0.03 for 3%)
  isPercentageEps?: boolean;
  weight: number;
}

export const DEFAULT_CATEGORY_RULES: Record<string, CategoryRuleConfig> = {
  display_type: { key: 'display_type', rule: 'ordinal', tieEps: 0, weight: 2 },
  resolution: { key: 'resolution', rule: 'higher', tieEps: 0, weight: 2 },
  refresh_rate: { key: 'refresh_rate', rule: 'higher', tieEps: 0, weight: 2 },
  peak_brightness: { key: 'peak_brightness', rule: 'higher', tieEps: 0.05, isPercentageEps: true, weight: 2 },
  chipset: { key: 'chipset', rule: 'ordinal', tieEps: 0, weight: 3 },
  ram: { key: 'ram', rule: 'higher', tieEps: 0, weight: 2 },
  storage: { key: 'storage', rule: 'higher', tieEps: 0, weight: 1 },
  battery: { key: 'battery', rule: 'higher', tieEps: 0.03, isPercentageEps: true, weight: 3 },
  charging: { key: 'charging', rule: 'higher', tieEps: 0, weight: 2 },
  main_camera: { key: 'main_camera', rule: 'higher', tieEps: 0, weight: 2 },
  selfie_camera: { key: 'selfie_camera', rule: 'higher', tieEps: 0, weight: 1 },
  video_recording: { key: 'video_recording', rule: 'ordinal', tieEps: 0, weight: 1 },
  weight: { key: 'weight', rule: 'lower', tieEps: 2, weight: 1 }, // 2g tie tolerance
  ip_rating: { key: 'ip_rating', rule: 'ordinal', tieEps: 0, weight: 1 },
  software_support: { key: 'software_support', rule: 'higher', tieEps: 0, weight: 2 },
  price: { key: 'price', rule: 'lower', tieEps: 0, weight: 2 },
};

export const DISPLAY_ORDINAL_MAP: Record<string, number> = {
  'LCD (TN/VA)': 1,
  'IPS LCD': 2,
  'OLED': 3,
  'AMOLED': 3, // Equal rank
  'LTPO AMOLED': 4,
  'LTPO OLED': 4,
};

export const VIDEO_ORDINAL_MAP: Record<string, number> = {
  '720p30': 1,
  '1080p30': 2,
  '1080p60': 3,
  '4K30': 4,
  '4K60': 5,
  '8K24': 6,
  '8K30': 7,
};

/**
 * Checks if value a is strictly better than b under rule and tie tolerance.
 */
export function isBetter(
  a: number,
  b: number,
  rule: ComparisonRule,
  tieEps = 0,
  isPercentage = false
): boolean {
  const eps = isPercentage ? Math.max(a, b) * tieEps : tieEps;

  if (rule === 'higher' || rule === 'ordinal') {
    return a > b + eps;
  } else {
    // lower is better
    return a < b - eps;
  }
}

/**
 * Computes competition ranking for an array of numeric values (1-based: 1, 1, 3).
 */
export function computeRanks(
  values: number[],
  rule: ComparisonRule,
  tieEps = 0,
  isPercentage = false
): number[] {
  const ranks: number[] = [];

  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    let countStrictlyBetter = 0;

    for (let j = 0; j < values.length; j++) {
      if (i === j) continue;
      const other = values[j];
      if (isBetter(other, val, rule, tieEps, isPercentage)) {
        countStrictlyBetter++;
      }
    }

    ranks.push(1 + countStrictlyBetter);
  }

  return ranks;
}

/**
 * Computes overall points and ranking:
 * points_i = Σ_categories weight_c × (n - rank_i + 1)
 */
export function computeOverall(
  categories: Array<{ ranking: number[]; weight?: number }>,
  phoneCount: number
): { points: number[]; ranking: number[] } {
  const points = new Array(phoneCount).fill(0);

  for (const cat of categories) {
    const weight = cat.weight ?? 1;
    for (let i = 0; i < phoneCount; i++) {
      const r = cat.ranking[i];
      points[i] += weight * (phoneCount - r + 1);
    }
  }

  // Rank phones by overall points (higher points = better rank)
  const ranking = computeRanks(points, 'higher');

  return { points, ranking };
}
