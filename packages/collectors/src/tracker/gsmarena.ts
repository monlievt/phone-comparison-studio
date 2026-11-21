// packages/collectors/src/tracker/gsmarena.ts
// Tracks newly announced / upcoming phones from GSMArena RSS

import { parseRssFeed } from './rss-parser.js';

export interface DiscoveredPhone {
  brand: string;
  model: string;
  sourceUrl: string;
  announcedDate?: string;
  status: 'announced' | 'released';
}

const COMMON_BRANDS = [
  'Samsung', 'Apple', 'Xiaomi', 'Redmi', 'POCO', 'Google', 'OnePlus', 
  'OPPO', 'Vivo', 'iQOO', 'Realme', 'Motorola', 'Honor', 'Nothing', 
  'Sony', 'Asus', 'Infinix', 'Tecno'
];

/**
 * Extracts phone brand and model from news headlines like:
 * "Samsung Galaxy S25 Ultra announced with Snapdragon 8 Elite"
 * "Xiaomi 15 Ultra is now official"
 */
export function extractPhoneFromTitle(title: string): { brand: string; model: string } | null {
  for (const brand of COMMON_BRANDS) {
    // Regex matching brand followed by model name (e.g., Samsung Galaxy S25)
    const pattern = new RegExp(`\\b(${brand})\\s+([A-Za-z0-9\\+\\s\\-]+?)(?:\\s+(?:is|announced|official|launches|unveiled|review|hands-on|specs|priced|goes|with|rumor|renders)|$)`, 'i');
    const match = title.match(pattern);
    if (match) {
      const detectedBrand = match[1].trim();
      const detectedModel = match[2].trim();
      // Ensure model is sensible length
      if (detectedModel.length >= 2 && detectedModel.length <= 40) {
        return {
          brand: detectedBrand,
          model: detectedModel,
        };
      }
    }
  }
  return null;
}

export async function fetchGsmArenaCandidates(feedUrl = 'https://www.gsmarena.com/rss-news-reviews.php3'): Promise<DiscoveredPhone[]> {
  try {
    const res = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) PhoneStudio/1.0',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
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
        const isOfficial = /announced|official|launches|unveiled/i.test(item.title);
        discovered.push({
          brand: match.brand,
          model: match.model,
          sourceUrl: item.link,
          announcedDate: item.pubDate ? new Date(item.pubDate).toISOString().slice(0, 10) : undefined,
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
