// packages/collectors/src/tracker/tracker.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '@phone-studio/core';
import type { LlmRouter } from '@phone-studio/ai';
import { parseRssFeed } from './rss-parser.js';
import { extractPhoneFromTitle } from './gsmarena.js';
import { CandidateTrackerService } from './tracker-service.js';

describe('parseRssFeed', () => {
  it('parses RSS 2.0 XML items correctly', () => {
    const xml = `
      <rss version="2.0">
        <channel>
          <title>GSMArena.com</title>
          <item>
            <title>Samsung Galaxy S25 Ultra announced with Snapdragon 8 Elite</title>
            <link>https://www.gsmarena.com/samsung_galaxy_s25_ultra-123.php</link>
            <pubDate>Thu, 22 Jan 2026 12:00:00 GMT</pubDate>
            <description>Full review and specifications.</description>
          </item>
        </channel>
      </rss>
    `;
    const items = parseRssFeed(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Samsung Galaxy S25 Ultra announced with Snapdragon 8 Elite');
    expect(items[0].link).toBe('https://www.gsmarena.com/samsung_galaxy_s25_ultra-123.php');
  });

  it('parses Atom <entry> feeds (e.g. Apple Newsroom)', () => {
    const xml = `
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Apple Newsroom</title>
        <entry>
          <title>Apple introduces iPhone 17 Pro with A19 Pro chip</title>
          <link rel="alternate" href="https://www.apple.com/newsroom/2025/09/iphone-17-pro/" />
          <published>2025-09-09T17:00:00Z</published>
          <summary>Official announcement.</summary>
        </entry>
      </feed>
    `;
    const items = parseRssFeed(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Apple introduces iPhone 17 Pro with A19 Pro chip');
    expect(items[0].link).toBe('https://www.apple.com/newsroom/2025/09/iphone-17-pro/');
    expect(items[0].pubDate).toBe('2025-09-09T17:00:00Z');
  });
});

describe('extractPhoneFromTitle', () => {
  it('extracts Samsung Galaxy phone', () => {
    const res = extractPhoneFromTitle('Samsung Galaxy S25 Ultra is officially unveiled');
    expect(res).not.toBeNull();
    expect(res?.brand).toBe('Samsung');
    expect(res?.model).toBe('Galaxy S25 Ultra');
  });

  it('extracts Xiaomi flagship phone', () => {
    const res = extractPhoneFromTitle('Xiaomi 15 Pro review: a new powerhouse');
    expect(res).not.toBeNull();
    expect(res?.brand).toBe('Xiaomi');
    expect(res?.model).toBe('15 Pro');
  });

  it('extracts implicit Apple iPhone and Google Pixel headlines', () => {
    const apple = extractPhoneFromTitle('iPhone 17 Pro Max launches with upgraded telephoto camera');
    expect(apple).toEqual({ brand: 'Apple', model: 'iPhone 17 Pro Max' });

    const pixel = extractPhoneFromTitle('Pixel 10 Pro review: Tensor G5 tested');
    expect(pixel).toEqual({ brand: 'Google', model: 'Pixel 10 Pro' });
  });

  it('ignores non-phone hardware, software, and corporate PR noise', () => {
    expect(extractPhoneFromTitle('Samsung Galaxy Watch 8 announced')).toBeNull();
    expect(extractPhoneFromTitle('Apple AirPods Pro 3 review')).toBeNull();
    expect(extractPhoneFromTitle('Motorola Moto Tag 3 listed on retail site')).toBeNull();
    expect(extractPhoneFromTitle('Google Health 5.13 rolling out with redesign')).toBeNull();
    expect(extractPhoneFromTitle('Samsung Celebrates 100 Years of Innovation')).toBeNull();
    expect(extractPhoneFromTitle('Samsung Galaxy SmartTag3 Makes It Easier')).toBeNull();
    expect(extractPhoneFromTitle('Samsung Galaxy S26 FE finally drops to $599')).toEqual({
      brand: 'Samsung',
      model: 'Galaxy S26 FE',
    });
  });

  it('returns null for generic news with no brand', () => {
    const res = extractPhoneFromTitle('Top 10 smartphones of the week');
    expect(res).toBeNull();
  });
});

describe('CandidateTrackerService', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS phone_candidates (
        id TEXT PRIMARY KEY,
        brand TEXT NOT NULL,
        model TEXT NOT NULL,
        variant TEXT,
        source TEXT NOT NULL,
        source_url TEXT,
        status TEXT NOT NULL DEFAULT 'announced',
        announced_date TEXT,
        release_date TEXT,
        estimated_price_usd REAL,
        soc_name TEXT,
        raw_payload_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(brand, model, variant)
      );
    `);
  });

  it('runs multi-source RSS discovery, surfaces feed errors, and upserts unique phones', async () => {
    const tracker = new CandidateTrackerService(db);
    const summary = await tracker.runDiscovery({
      feeds: [
        { id: 'gsmarena_rss', label: 'GSMArena', url: 'https://example.test/gsm' },
        { id: 'gizmochina_rss', label: 'Gizmochina', url: 'https://example.test/giz' },
      ],
      feedFetcher: async (feed) => {
        if (feed.id === 'gsmarena_rss') {
          return {
            id: feed.id,
            label: feed.label,
            phones: [
              {
                brand: 'OnePlus',
                model: '13R',
                sourceUrl: 'https://example.test/oneplus-13r',
                status: 'released',
              },
            ],
          };
        }
        return { id: feed.id, label: feed.label, phones: [], error: 'HTTP 403' };
      },
    });

    expect(summary.gsmarenaFound).toBe(1);
    expect(summary.totalFound).toBe(1);
    expect(summary.inserted).toBe(1);
    expect(summary.feeds).toEqual([
      { id: 'gsmarena_rss', label: 'GSMArena', found: 1 },
      { id: 'gizmochina_rss', label: 'Gizmochina', found: 0, error: 'HTTP 403' },
    ]);

    const candidates = tracker.getAvailableCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].brand).toBe('OnePlus');
    expect(candidates[0].model).toBe('13R');
  });

  it('supports optional Gemini grounded discovery and stores estimated price when present', async () => {
    const tracker = new CandidateTrackerService(db);
    const fakeRouter = {
      callJson: async () => ({
        data: {
          phones: [
            {
              brand: 'Nothing',
              model: 'Phone 3a Pro',
              status: 'released' as const,
              announcedDate: '2026-03-04',
              estimatedPriceUsd: 459,
              sourceUrl: 'https://nothing.tech/pages/phone-3a-pro',
            },
          ],
        },
        rawJson: '{}',
        provider: 'gemini-pro',
        model: 'gemini-2.5-flash',
        fromCache: false,
        attempts: 1,
      }),
    } as unknown as LlmRouter;

    const summary = await tracker.runDiscovery({
      includeRss: false,
      includeGemini: true,
      router: fakeRouter,
    });

    expect(summary.geminiFound).toBe(1);
    expect(summary.inserted).toBe(1);
    expect(summary.geminiError).toBeUndefined();

    const row = db
      .prepare('SELECT brand, model, estimated_price_usd, source FROM phone_candidates WHERE brand = ?')
      .get('Nothing') as { brand: string; model: string; estimated_price_usd: number | null; source: string };
    expect(row.model).toBe('Phone 3a Pro');
    expect(row.estimated_price_usd).toBe(459);
    expect(row.source).toBe('gemini_search');
  });
});
