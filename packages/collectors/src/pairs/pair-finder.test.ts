// packages/collectors/src/pairs/pair-finder.test.ts
import { describe, it, expect } from 'vitest';
import { calculatePairScore, proposePairs, PhoneCandidateForPair } from './pair-finder.js';

describe('calculatePairScore', () => {
  const phoneA: PhoneCandidateForPair = {
    id: 'a',
    brand: 'Samsung',
    model: 'Galaxy A55',
    priceUSD: 349,
    socTier: 65,
    releaseDate: new Date().toISOString(),
    hasSpecs: true,
  };

  const phoneB: PhoneCandidateForPair = {
    id: 'b',
    brand: 'Xiaomi',
    model: '14T',
    priceUSD: 369,
    socTier: 67,
    releaseDate: new Date().toISOString(),
    hasSpecs: true,
  };

  const phoneTooExpensive: PhoneCandidateForPair = {
    id: 'c',
    brand: 'Apple',
    model: 'iPhone 16 Pro Max',
    priceUSD: 1199,
    socTier: 100,
  };

  it('scores close competitors highly (> 75)', () => {
    const res = calculatePairScore(phoneA, phoneB);
    expect(res).not.toBeNull();
    expect(res!.score).toBeGreaterThan(75);
    expect(res!.reasons.length).toBeGreaterThan(0);
    expect(res!.reasons.some((r) => r.includes('Price difference'))).toBe(true);
  });

  it('rejects comparison with huge price gap', () => {
    const res = calculatePairScore(phoneA, phoneTooExpensive);
    expect(res).toBeNull();
  });
});

describe('proposePairs', () => {
  it('ranks topics descending by score', () => {
    const phones: PhoneCandidateForPair[] = [
      { id: '1', brand: 'Samsung', model: 'S25', priceUSD: 799, socTier: 94 },
      { id: '2', brand: 'Xiaomi', model: '15', priceUSD: 769, socTier: 94 },
      { id: '3', brand: 'Google', model: 'Pixel 9', priceUSD: 799, socTier: 88 },
    ];
    const topics = proposePairs(phones, 60);
    expect(topics.length).toBeGreaterThan(0);
    expect(topics[0].score).toBeGreaterThanOrEqual(topics[1]?.score ?? 0);
  });
});
