import {benchmarkRanks} from '../lib/benchmark';
import {Comparison} from '../types';
import {Section} from './types';

// Fallback overall score (points = weight x (n - rank + 1)). The verdict engine will provide Comparison.overall.
export const computeOverall = (c: Comparison): {points: number[]; wins: number[]; ranking: number[]; winners: number[]} => {
  const n = c.phones.length;
  const wins = c.phones.map(() => 0);
  const computed = c.phones.map(() => 0);
  c.categories.forEach((cat) => {
    const w = cat.weight ?? 1;
    cat.ranking.forEach((r, i) => {
      computed[i] += w * (n - r + 1);
      if (r === 1) wins[i] += 1;
    });
  });
  const points = c.overall?.points ?? computed;
  const ranking = c.overall?.ranking ?? points.map((p) => 1 + points.filter((o) => o > p).length);
  const winners = ranking.flatMap((r, i) => (r === 1 ? [i] : []));
  return {points, wins, ranking, winners};
};

// Ranks of the phones inside a category or benchmark section (null for other sections).
export const sectionRanks = (c: Comparison, s: Section): number[] | null => {
  if (s.kind === 'category' && s.catIndex != null) return c.categories[s.catIndex].ranking;
  if (s.kind === 'benchmark' && s.benchIndex != null) {
    const b = c.benchmarks![s.benchIndex];
    return benchmarkRanks(b.scores as NonNullable<(typeof b.scores)[number]>[], b.lowerIsBetter);
  }
  return null;
};
