import { describe, it, expect } from 'vitest';
import { computeBezel } from './ParametricPhone';

describe('computeBezel', () => {
  it('returns default bezel for standard phone', () => {
    const res = computeBezel();
    expect(res.sideBezelPct).toBe(0.035);
    expect(res.cornerRadiusPct).toBe(0.12);
  });

  it('reduces bezel percentage for curved displays', () => {
    const res = computeBezel({ edge: 'curved' });
    expect(res.sideBezelPct).toBe(0.02);
  });

  it('adjusts corner radius for flat frame design', () => {
    const res = computeBezel({ frame: 'flat' });
    expect(res.cornerRadiusPct).toBe(0.10);
  });
});
