// packages/core/src/verdict.test.ts
import { describe, it, expect } from 'vitest';
import { computeRanks, computeOverall, isBetter } from './verdict.js';

describe('isBetter', () => {
  it('handles higher is better without tieEps', () => {
    expect(isBetter(5000, 4800, 'higher')).toBe(true);
    expect(isBetter(4800, 5000, 'higher')).toBe(false);
  });

  it('handles tieEps percentage (e.g. 3% for battery)', () => {
    // 5000 vs 4900 -> 4900 is within 3% (150) of 5000, so not strictly better
    expect(isBetter(5000, 4900, 'higher', 0.03, true)).toBe(false);
    expect(isBetter(5000, 4800, 'higher', 0.03, true)).toBe(true);
  });

  it('handles lower is better (e.g. price, weight)', () => {
    expect(isBetter(349, 399, 'lower')).toBe(true);
    expect(isBetter(399, 349, 'lower')).toBe(false);
  });

  it('handles weight tie tolerance 2g', () => {
    // 180g vs 181g -> within 2g -> neither is better
    expect(isBetter(180, 181, 'lower', 2)).toBe(false);
    expect(isBetter(180, 183, 'lower', 2)).toBe(true);
  });
});

describe('computeRanks', () => {
  it('ranks simple 2 phones', () => {
    expect(computeRanks([120, 90], 'higher')).toEqual([1, 2]);
    expect(computeRanks([349, 399], 'lower')).toEqual([1, 2]);
  });

  it('handles ties (1, 1)', () => {
    expect(computeRanks([120, 120], 'higher')).toEqual([1, 1]);
  });

  it('handles competition ranking for 3 phones with tie (1, 1, 3)', () => {
    expect(computeRanks([5000, 5000, 4500], 'higher')).toEqual([1, 1, 3]);
  });

  it('handles competition ranking for 3 phones with lower tie (1, 2, 2)', () => {
    expect(computeRanks([6000, 5000, 5000], 'higher')).toEqual([1, 2, 2]);
  });
});

describe('computeOverall', () => {
  it('computes overall points and winner ranking correctly', () => {
    const categories = [
      { ranking: [1, 2], weight: 3 }, // battery
      { ranking: [2, 1], weight: 2 }, // refresh rate
      { ranking: [1, 2], weight: 2 }, // price
    ];
    // n = 2
    // phone 0: 3*(2-1+1) + 2*(2-2+1) + 2*(2-1+1) = 3*2 + 2*1 + 2*2 = 6 + 2 + 4 = 12
    // phone 1: 3*(2-2+1) + 2*(2-1+1) + 2*(2-2+1) = 3*1 + 2*2 + 2*1 = 3 + 4 + 2 = 9
    const res = computeOverall(categories, 2);
    expect(res.points).toEqual([12, 9]);
    expect(res.ranking).toEqual([1, 2]);
  });

  it('handles overall tie in points', () => {
    const categories = [
      { ranking: [1, 2], weight: 2 },
      { ranking: [2, 1], weight: 2 },
    ];
    const res = computeOverall(categories, 2);
    expect(res.points).toEqual([6, 6]);
    expect(res.ranking).toEqual([1, 1]);
  });
});
