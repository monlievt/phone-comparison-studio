// packages/core/src/parse.ts
// Robust number and unit parsers for phone specs.
// Rules from VERDICT_RULES.md and IMPLEMENTATION_PLAN.md T-010.
// Never guess: unparseable inputs return null.

export interface ParsedResolution {
  width: number;
  height: number;
  totalPixels: number;
}

export interface ParsedIpRating {
  dust: number;  // 0-6 (IPX8 -> dust 0)
  water: number; // 0-9
  score: number; // calculated ordinal score
}

/**
 * Extracts a numeric value from string representations like:
 * "5,000 mAh" -> 5000
 * "120W" -> 120
 * "6.67 inches" -> 6.67
 * "185 g" -> 185
 */
export function parseNumber(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return isNaN(input) ? null : input;

  const cleaned = input.replace(/,/g, '').trim();
  const match = cleaned.match(/[-+]?\d*\.?\d+/);
  if (!match) return null;

  const num = parseFloat(match[0]);
  return isNaN(num) ? null : num;
}

/**
 * Parses resolution string e.g. "2400 x 1080", "1080 × 2400 px"
 */
export function parseResolution(input: string | null | undefined): ParsedResolution | null {
  if (!input) return null;

  const cleaned = input.replace(/,/g, '').trim();
  const match = cleaned.match(/(\d{3,5})\s*[x×*]\s*(\d{3,5})/i);
  if (!match) return null;

  const d1 = parseInt(match[1], 10);
  const d2 = parseInt(match[2], 10);
  if (isNaN(d1) || isNaN(d2)) return null;

  // Standardize: height is the larger dimension, width is the smaller
  const height = Math.max(d1, d2);
  const width = Math.min(d1, d2);
  const totalPixels = width * height;

  return { width, height, totalPixels };
}

/**
 * Parses IP rating: e.g. "IP68", "IP65/IP68", "IPX8", "IP54"
 */
export function parseIpRating(input: string | null | undefined): ParsedIpRating | null {
  if (!input) return null;

  const cleaned = input.toUpperCase().trim();
  // Match IP followed by dust (digit or X) and water (digit)
  const match = cleaned.match(/IP([0-6X])([0-9])/);
  if (!match) return null;

  const dustChar = match[1];
  const waterChar = match[2];

  const dust = dustChar === 'X' ? 0 : parseInt(dustChar, 10);
  const water = parseInt(waterChar, 10);

  // Score algorithm: water level has higher weight, dust is secondary
  // e.g. IP68 -> 6*10 + 8 = 68; IPX8 -> 0*10 + 8 = 8
  const score = dust * 10 + water;

  return { dust, water, score };
}

/**
 * Parses refresh rate: e.g. "120Hz", "144 Hz", "Adaptive 1-120 Hz" -> 120 / 144
 */
export function parseRefreshRate(input: string | null | undefined): number | null {
  if (!input) return null;
  // If range e.g. 1-120 Hz, grab the highest number
  const matches = input.match(/\b(\d{2,3})\s*Hz\b/gi);
  if (matches) {
    const nums = matches.map((m) => parseInt(m, 10)).filter((n) => !isNaN(n));
    return nums.length > 0 ? Math.max(...nums) : null;
  }
  return parseNumber(input);
}

/**
 * Parses charging wattage: e.g. "120W wired, 50W wireless" -> 120 (wired is primary)
 */
export function parseCharging(input: string | null | undefined): number | null {
  if (!input) return null;
  const match = input.match(/(\d{1,3})\s*W/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return parseNumber(input);
}
