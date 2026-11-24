import {Comparison} from '../types';

export function deriveComparisonBadge(comparison: Comparison): string | null {
  const phones = comparison.phones;
  if (!phones || phones.length < 2) return null;

  // 1. Check same chipset
  const chipsetCat = comparison.categories?.find(
    (c) => c.key === 'chipset' || c.key === 'soc'
  );
  let sameChipset: string | null = null;
  if (chipsetCat?.values && chipsetCat.values.length >= 2) {
    const v0 = chipsetCat.values[0]?.primary?.trim();
    if (v0 && chipsetCat.values.every((v) => v?.primary?.trim()?.toLowerCase() === v0.toLowerCase())) {
      sameChipset = v0;
    }
  }

  // 2. Check same price
  const prices = phones
    .map((p) => p.priceUSD)
    .filter((p): p is number => typeof p === 'number' && p > 0);
  const samePrice = prices.length >= 2 && prices.every((p) => p === prices[0]);

  if (sameChipset && samePrice) {
    return `SAME ${sameChipset.toUpperCase()} • BOTH $${prices[0]}`;
  }
  if (sameChipset) {
    return `SAME ${sameChipset.toUpperCase()}`;
  }
  if (samePrice) {
    return `SAME PRICE • BOTH $${prices[0]}`;
  }

  // 3. Fallback to comparison hook if short
  if (comparison.hook && comparison.hook.length <= 40) {
    return comparison.hook.toUpperCase();
  }

  // 4. Fallback to price tier
  if (prices.length >= 2) {
    const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    if (avgPrice < 350) return 'BUDGET SHOWDOWN';
    if (avgPrice < 700) return 'FLAGSHIP KILLER SHOWDOWN';
    return 'FLAGSHIP SHOWDOWN';
  }

  return 'DIRECT SHOWDOWN';
}
