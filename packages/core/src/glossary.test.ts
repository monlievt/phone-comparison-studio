// packages/core/src/glossary.test.ts
import { describe, it, expect } from 'vitest';
import {
  formatPriceUSD,
  formatScore,
  formatBattery,
  formatRefreshRate,
  formatCharging,
  formatWeight,
  CATEGORY_LABELS,
} from './glossary.js';

describe('formatPriceUSD', () => {
  it('formats exact price', () => {
    expect(formatPriceUSD(349)).toBe('$349');
  });

  it('formats approximate converted price', () => {
    expect(formatPriceUSD(349.4, true)).toBe('≈$349');
  });

  it('handles null/undefined', () => {
    expect(formatPriceUSD(null)).toBe('N/A');
    expect(formatPriceUSD(undefined)).toBe('N/A');
  });
});

describe('formatScore', () => {
  it('adds commas to large benchmark scores', () => {
    expect(formatScore(2150000)).toBe('2,150,000');
  });
});

describe('formatters', () => {
  it('formats battery with mAh', () => {
    expect(formatBattery(5000)).toBe('5,000 mAh');
  });

  it('formats refresh rate with Hz', () => {
    expect(formatRefreshRate(144)).toBe('144 Hz');
  });

  it('formats charging with W', () => {
    expect(formatCharging(120)).toBe('120 W');
  });

  it('formats weight with g', () => {
    expect(formatWeight(185.4)).toBe('185 g');
  });

  it('has label for price and battery', () => {
    expect(CATEGORY_LABELS.battery).toBe('Battery Capacity');
    expect(CATEGORY_LABELS.price).toBe('Launch Price');
  });
});
