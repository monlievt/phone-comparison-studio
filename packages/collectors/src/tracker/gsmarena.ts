// packages/collectors/src/tracker/gsmarena.ts
// Extracts clean smartphone brand/model candidates from RSS/Atom headlines.

import { parseRssFeed } from './rss-parser.js';

export interface DiscoveredPhone {
  brand: string;
  model: string;
  sourceUrl: string;
  announcedDate?: string;
  estimatedPriceUsd?: number | null;
  status: 'announced' | 'released';
}

const COMMON_BRANDS = [
  'Samsung', 'Apple', 'Xiaomi', 'Redmi', 'POCO', 'Google', 'OnePlus',
  'OPPO', 'Vivo', 'iQOO', 'Realme', 'Motorola', 'Honor', 'Nothing',
  'Sony', 'Asus', 'Infinix', 'Tecno', 'Huawei', 'Nubia', 'ZTE', 'CMF',
];

// Series names that uniquely identify a brand even when the brand name is omitted in headlines
const IMPLICIT_BRAND_SERIES: Array<{ brand: string; prefix: RegExp }> = [
  { brand: 'Apple', prefix: /\b(iPhone\s+(?:\d{2}[a-z]?(?:\s+(?:Pro(?:\s+Max)?|Plus|Air|Ultra|Mini|Fold))?|SE(?:\s+\d+)?|Air))\b/i },
  { brand: 'Google', prefix: /\b(Pixel\s+(?:\d{1,2}[a-z]?(?:\s+(?:Pro(?:\s+XL|\s+Fold)?|Fold|Ultra))?))\b/i },
  { brand: 'Samsung', prefix: /\b(Galaxy\s+(?:S\d{2}|Z\s+(?:Fold|Flip)\s*\d+|A\d{2}|M\d{2}|F\d{2}|XCover\s*\d+)(?:\s+(?:Ultra|Plus|\+|FE|Edge|Slim|5G))*)\b/i },
];

// Strict series validation for multi-category tech giants so PR/software/wearables never pollute phone candidates
const STRICT_BRAND_SERIES: Record<string, RegExp> = {
  Samsung: /^Galaxy\s+(?:S\d{2}|Z\s+(?:Fold|Flip)\s*\d+|A\d{2}|M\d{2}|F\d{2}|XCover\s*\d+)/i,
  Apple: /^iPhone\s+(?:\d{2}|SE|Air)/i,
  Google: /^Pixel\s+\d{1,2}/i,
};

const STOP_WORDS = [
  'is', 'are', 'was', 'were', 'will', 'may', 'might', 'could', 'should', 'can',
  'announced', 'official', 'officially', 'launches', 'launched', 'launch', 'unveiled', 'unveils',
  'debuts', 'introduces', 'review', 'hands-on', 'specs', 'specifications', 'priced', 'price',
  'goes', 'with', 'rumor', 'rumors', 'leaks', 'leaked', 'renders', 'gets', 'brings', 'arrives',
  'spotted', 'teased', 'confirmed', 'listed', 'finally', 'drops', 'rolling', 'makes', 'takes',
  'shows', 'expected', 'tipped', 'reportedly', 'appears', 'passes', 'hits', 'breaks', 'beats',
  'adds', 'removes', 'updates', 'supports', 'offers', 'features', 'packs', 'comes', 'runs',
  'uses', 'has', 'have', 'now', 'on', 'in', 'for', 'at', 'to', 'from', 'by', 'and', 'or', 'vs\\.?',
].join('|');

const NOISE_REGEX =
  /\b(watch|buds|tab|tablet|pad|book|laptop|tv|macbook|mac|ipad|airpods|vision|tag|smarttag|ring|band|glasses|health|home|play|maps|chrome|gemini|wallet|photos|workspace|speaker|router|car|auto|cloud|exynos|snapdragon|dimensity|tensor|os|ui|android|ios|update|patch|app|chip|store|event|sale|deal|case|cover|charger|stylus|pen|celebrates|ranks)\b/i;

function cleanModel(raw: string): string {
  return raw
    .replace(/['’]s$/i, '')
    .replace(/[:\-–|,]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelySmartphoneModel(brand: string, model: string): boolean {
  if (model.length < 2 || model.length > 36) return false;
  if (model.split(/\s+/).length > 4) return false;
  if (NOISE_REGEX.test(model)) return false;

  const strictRule = STRICT_BRAND_SERIES[brand];
  if (strictRule && !strictRule.test(model)) {
    return false;
  }

  // Require at least one digit or known phone series token
  const hasDigit = /\d/.test(model);
  const hasSeriesToken = /\b(fold|flip|edge|note|ultra|pro|plus|max|mini|air|phone|pixel|iphone|galaxy|razr|find|magic)\b/i.test(model);
  if (!hasDigit && !hasSeriesToken) return false;
  if (model.toLowerCase() === brand.toLowerCase()) return false;
  return true;
}

/**
 * Extracts phone brand and model from news headlines like:
 * "Samsung Galaxy S26 Ultra announced with Snapdragon 8 Elite 2"
 * "Apple introduces iPhone 17 Pro and iPhone 17 Pro Max"
 * "Pixel 10 Pro review: Google's refined flagship"
 */
export function extractPhoneFromTitle(title: string): { brand: string; model: string } | null {
  const normalizedTitle = title.replace(/\s+/g, ' ').trim();

  // Check implicit flagship series first for crisp extraction (iPhone / Pixel / Galaxy)
  for (const entry of IMPLICIT_BRAND_SERIES) {
    const match = normalizedTitle.match(entry.prefix);
    if (match) {
      const detectedModel = cleanModel(match[1]);
      if (isLikelySmartphoneModel(entry.brand, detectedModel)) {
        return {
          brand: entry.brand,
          model: detectedModel,
        };
      }
    }
  }

  for (const brand of COMMON_BRANDS) {
    const pattern = new RegExp(`\\b(${brand})\\s+([A-Za-z0-9\\+\\s\\-\\.]+?)(?=\\s+(?:${STOP_WORDS})\\b|:|,|\\||\\(|$)`, 'i');
    const match = normalizedTitle.match(pattern);
    if (match) {
      const detectedBrand = brand;
      const detectedModel = cleanModel(match[2]);
      if (isLikelySmartphoneModel(detectedBrand, detectedModel)) {
        return {
          brand: detectedBrand,
          model: detectedModel,
        };
      }
    }
  }

  return null;
}

export async function fetchGsmArenaCandidates(
  feedUrl = 'https://www.gsmarena.com/rss-news-reviews.php3'
): Promise<DiscoveredPhone[]> {
  try {
    const res = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`[tracker:gsmarena] Failed to fetch RSS: HTTP ${res.status}`);
      return [];
    }

    const xml = await res.text();
    const items = parseRssFeed(xml);
    const discovered: DiscoveredPhone[] = [];

    for (const item of items) {
      const match = extractPhoneFromTitle(item.title);
      if (match) {
        const isOfficial = /announced|official|launches|unveiled|introduces|debuts/i.test(item.title);
        const parsedDate = item.pubDate ? Date.parse(item.pubDate) : NaN;
        discovered.push({
          brand: match.brand,
          model: match.model,
          sourceUrl: item.link,
          announcedDate: Number.isNaN(parsedDate) ? undefined : new Date(parsedDate).toISOString().slice(0, 10),
          status: isOfficial ? 'announced' : 'released',
        });
      }
    }

    return discovered;
  } catch (err) {
    console.warn('[tracker:gsmarena] Fetch error:', err);
    return [];
  }
}
