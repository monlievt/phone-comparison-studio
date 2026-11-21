// packages/collectors/src/specs/spec-collector.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { SpecCollector, verifyNumericTokensInText } from './spec-collector.js';

describe('verifyNumericTokensInText', () => {
  it('returns true when numbers exist in source text', () => {
    const raw = 'The device packs a 5000mAh battery with 120W fast charging.';
    expect(verifyNumericTokensInText('5,000 mAh', raw)).toBe(true);
    expect(verifyNumericTokensInText('120W', raw)).toBe(true);
  });

  it('returns false when hallucinated numbers are not in source text', () => {
    const raw = 'The device packs a 5000mAh battery.';
    expect(verifyNumericTokensInText('6,000 mAh', raw)).toBe(false);
  });
});

describe('SpecCollector', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS phones (
        id TEXT PRIMARY KEY,
        brand TEXT NOT NULL,
        model TEXT NOT NULL,
        variant TEXT,
        release_date TEXT,
        soc TEXT,
        price_usd REAL,
        shape_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS spec_values (
        id TEXT PRIMARY KEY,
        phone_id TEXT NOT NULL,
        category_key TEXT NOT NULL,
        raw_value TEXT,
        source_url TEXT,
        source_kind TEXT,
        fetched_at TEXT,
        confidence REAL,
        UNIQUE(phone_id, category_key)
      );
    `);
  });

  it('collects specs and lowers confidence when numbers are not in text', async () => {
    const mockRouter: any = {
      callJson: vi.fn().mockResolvedValue({
        data: {
          phone: {
            brand: 'Samsung',
            model: 'Galaxy S25',
            variant: null,
            releaseDate: '2026-02-01',
            soc: 'Snapdragon 8 Elite',
            priceUSD: 799,
            priceCurrencyOriginal: null,
            priceOriginal: null,
          },
          fields: {
            battery: { value: '6000 mAh', evidence: 'Massive battery' }, // Note: 6000 is not in mock text!
            charging: { value: '45W', evidence: '45W fast charging' },
          },
        },
      }),
    };

    const mockFetcher: any = {
      fetch: vi.fn().mockResolvedValue('<html><body>Supports 45W fast charging with 4000mAh.</body></html>'),
    };

    const collector = new SpecCollector(db, mockRouter, mockFetcher);
    const res = await collector.collect({
      brand: 'Samsung',
      model: 'Galaxy S25',
      specUrl: 'https://samsung.com/s25',
    });

    expect(res.brand).toBe('Samsung');
    // battery 6000 was not in page text, so confidence penalized (0.9 * 0.4 = 0.36)
    expect(res.specs.battery.confidence).toBeLessThan(0.5);
    // charging 45 was in page text, confidence maintained at 0.9
    expect(res.specs.charging.confidence).toBe(0.9);
  });
});
