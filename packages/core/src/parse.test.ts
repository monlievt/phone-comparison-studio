// packages/core/src/parse.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseNumber,
  parseResolution,
  parseIpRating,
  parseRefreshRate,
  parseCharging,
} from './parse.js';

describe('parseNumber', () => {
  it('parses formatted numbers and units', () => {
    expect(parseNumber('5,000 mAh')).toBe(5000);
    expect(parseNumber('120W')).toBe(120);
    expect(parseNumber('6.67 inches')).toBe(6.67);
    expect(parseNumber('185 g')).toBe(185);
    expect(parseNumber('$349')).toBe(349);
    expect(parseNumber('≈$349.50')).toBe(349.5);
  });

  it('returns null for null, undefined or unparseable string', () => {
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
    expect(parseNumber('unknown')).toBeNull();
  });
});

describe('parseResolution', () => {
  it('parses standard resolution formats', () => {
    const res1 = parseResolution('2400 x 1080');
    expect(res1).toEqual({ width: 1080, height: 2400, totalPixels: 2592000 });

    const res2 = parseResolution('1080 × 2400 px');
    expect(res2).toEqual({ width: 1080, height: 2400, totalPixels: 2592000 });
  });

  it('returns null for invalid strings', () => {
    expect(parseResolution('FHD+')).toBeNull();
    expect(parseResolution(null)).toBeNull();
  });
});

describe('parseIpRating', () => {
  it('parses valid IP ratings', () => {
    expect(parseIpRating('IP68')).toEqual({ dust: 6, water: 8, score: 68 });
    expect(parseIpRating('IP54')).toEqual({ dust: 5, water: 4, score: 54 });
    expect(parseIpRating('IP65/IP68')).toEqual({ dust: 6, water: 5, score: 65 });
  });

  it('handles IPX8 (dust 0)', () => {
    expect(parseIpRating('IPX8')).toEqual({ dust: 0, water: 8, score: 8 });
  });

  it('returns null for invalid', () => {
    expect(parseIpRating('None')).toBeNull();
    expect(parseIpRating(null)).toBeNull();
  });
});

describe('parseRefreshRate', () => {
  it('parses refresh rates', () => {
    expect(parseRefreshRate('120Hz')).toBe(120);
    expect(parseRefreshRate('144 Hz')).toBe(144);
    expect(parseRefreshRate('Adaptive 1-120 Hz')).toBe(120);
  });
});

describe('parseCharging', () => {
  it('parses charging wattage', () => {
    expect(parseCharging('120W wired, 50W wireless')).toBe(120);
    expect(parseCharging('67W')).toBe(67);
  });
});
