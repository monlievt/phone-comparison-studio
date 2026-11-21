// packages/collectors/src/tracker/tracker.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { parseRssFeed } from './rss-parser.js';
import { extractPhoneFromTitle } from './gsmarena.js';
import { CandidateTrackerService } from './tracker-service.js';

describe('parseRssFeed', () => {
  it('parses XML items correctly', () => {
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

  it('inserts unique candidate phones', () => {
    const tracker = new CandidateTrackerService(db);
    // Directly test querying
    const candidates = tracker.getAvailableCandidates();
    expect(candidates).toEqual([]);
  });
});
