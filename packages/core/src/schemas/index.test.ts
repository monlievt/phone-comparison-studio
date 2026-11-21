// packages/core/src/schemas/index.test.ts
import { describe, it, expect } from 'vitest';
import { validateComparison, validateNumbers, ComparisonSchema } from './index.js';

const base = {
  id: 'cmp_01',
  market: 'global' as const,
  currency: 'USD' as const,
  credits: ['Source: samsung.com'],
  phones: [
    { id: 'p1', name: 'Phone A', accent: '#1a1a1a', priceUSD: 349 },
    { id: 'p2', name: 'Phone B', accent: '#2b2b2b', priceUSD: 399 },
  ],
  categories: [
    {
      key: 'battery',
      label: 'Battery',
      values: [{ primary: '5000 mAh' }, { primary: '4800 mAh' }],
      ranking: [1, 2],
      weight: 3,
    },
    {
      key: 'refresh_rate',
      label: 'Refresh rate',
      values: [{ primary: '120 Hz' }, { primary: '144 Hz' }],
      ranking: [2, 1],
      weight: 2,
    },
  ],
};

describe('validateComparison', () => {
  it('passes a valid comparison', () => {
    expect(validateComparison(base)).toEqual([]);
  });

  it('fails when values.length !== phones.length', () => {
    const bad = {
      ...base,
      categories: [
        { ...base.categories[0], values: [{ primary: '5000 mAh' }] }, // only 1 value for 2 phones
        base.categories[1],
      ],
    };
    const errors = validateComparison(bad);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/values\.length/);
  });

  it('fails when no rank 1 in category', () => {
    const bad = {
      ...base,
      categories: [
        { ...base.categories[0], ranking: [2, 3] }, // no rank 1
        base.categories[1],
      ],
    };
    const errors = validateComparison(bad);
    expect(errors.some((e) => e.includes('no rank 1'))).toBe(true);
  });

  it('fails when image has no license', () => {
    const bad = {
      ...base,
      phones: [
        {
          ...base.phones[0],
          image: { src: '/img/a.jpg', license: '', sourceUrl: 'https://samsung.com', accessedAt: '2026-11-01' },
        },
        base.phones[1],
      ],
    };
    const errors = validateComparison(bad);
    expect(errors.some((e) => e.includes('image.license'))).toBe(true);
  });
});

describe('validateNumbers', () => {
  it('passes when all copy numbers exist in data', () => {
    const result = validateNumbers(base, [
      'Battery: 5000 mAh vs 4800 mAh at $349',
    ]);
    expect(result).toEqual([]);
  });

  it('catches a fabricated number in copy', () => {
    const result = validateNumbers(base, [
      'The winner has a 6000 mAh battery',
    ]);
    expect(result.some((r) => r.token === '6000')).toBe(true);
  });

  it('ignores numbers that appear in data', () => {
    const result = validateNumbers(base, [
      'Priced at $349 and $399',
    ]);
    expect(result).toEqual([]);
  });
});

describe('ComparisonSchema', () => {
  it('parses a valid comparison', () => {
    const result = ComparisonSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('rejects fewer than 2 phones', () => {
    const bad = { ...base, phones: [base.phones[0]] };
    expect(ComparisonSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects more than 3 phones', () => {
    const bad = { ...base, phones: [base.phones[0], base.phones[1], base.phones[0], base.phones[1]] };
    expect(ComparisonSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects hook longer than 40 chars', () => {
    const bad = { ...base, hook: 'a'.repeat(41) };
    expect(ComparisonSchema.safeParse(bad).success).toBe(false);
  });
});
