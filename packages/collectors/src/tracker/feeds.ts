// packages/collectors/src/tracker/feeds.ts
// Multi-source public RSS/Atom smartphone release feeds (free, $0 budget, no HTML scraping).

import { parseRssFeed } from './rss-parser.js';
import { DiscoveredPhone, extractPhoneFromTitle } from './gsmarena.js';

export interface PhoneFeedConfig {
  id: string;
  label: string;
  url: string;
  defaultBrand?: string;
}

export interface FeedFetchResult {
  id: string;
  label: string;
  phones: DiscoveredPhone[];
  error?: string;
}

export const DEFAULT_PHONE_FEEDS: PhoneFeedConfig[] = [
  {
    id: 'gsmarena_rss',
    label: 'GSMArena',
    url: 'https://www.gsmarena.com/rss-news-reviews.php3',
  },
  {
    id: 'gizmochina_rss',
    label: 'Gizmochina',
    url: 'https://www.gizmochina.com/feed/',
  },
  {
    id: 'androidauthority_rss',
    label: 'Android Authority',
    url: 'https://www.androidauthority.com/news/feed/',
  },
  {
    id: '9to5google_rss',
    label: '9to5Google',
    url: 'https://9to5google.com/feed/',
  },
  {
    id: 'apple_newsroom',
    label: 'Apple Newsroom',
    url: 'https://www.apple.com/newsroom/rss-feed.rss',
    defaultBrand: 'Apple',
  },
  {
    id: 'samsung_newsroom',
    label: 'Samsung Newsroom',
    url: 'https://news.samsung.com/global/feed',
    defaultBrand: 'Samsung',
  },
  {
    id: 'google_pixel_blog',
    label: 'Google Pixel Blog',
    url: 'https://blog.google/products/pixel/rss/',
    defaultBrand: 'Google',
  },
];

export async function fetchFeedCandidates(feed: PhoneFeedConfig): Promise<FeedFetchResult> {
  try {
    const res = await fetch(feed.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return { id: feed.id, label: feed.label, phones: [], error: `HTTP ${res.status}` };
    }

    const xml = await res.text();
    const items = parseRssFeed(xml);
    const seen = new Set<string>();
    const phones: DiscoveredPhone[] = [];

    for (const item of items) {
      const extracted = extractPhoneFromTitle(item.title);
      if (!extracted) continue;

      const key = `${extracted.brand.toLowerCase()}::${extracted.model.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const isOfficial = /announced|official|launches|unveiled|introduces|debuts/i.test(item.title);
      const parsedDate = item.pubDate ? Date.parse(item.pubDate) : NaN;

      phones.push({
        brand: extracted.brand,
        model: extracted.model,
        sourceUrl: item.link,
        announcedDate: Number.isNaN(parsedDate) ? undefined : new Date(parsedDate).toISOString().slice(0, 10),
        status: isOfficial ? 'announced' : 'released',
      });
    }

    return { id: feed.id, label: feed.label, phones };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { id: feed.id, label: feed.label, phones: [], error: message };
  }
}
