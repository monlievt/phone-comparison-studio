import {Category, Comparison} from '../types';
import {BENCHMARK_SECONDS, categorySeconds} from './timing';
import {completeBenchmarks} from './benchmark';

// Build a 2-phone view from a 3-phone comparison, recomputing ranks inside the subset.
export const subset = (c: Comparison, idx: number[]): Comparison => ({
  ...c,
  id: `${c.id}-${idx.length}`,
  phones: idx.map((i) => c.phones[i]),
  benchmarks: c.benchmarks?.map((b) => ({...b, scores: idx.map((i) => b.scores[i])})),
  categories: c.categories.map((cat) => {
    const ranks = idx.map((i) => cat.ranking[i]);
    return {
      ...cat,
      values: idx.map((i) => cat.values[i]),
      ranking: ranks.map((r) => 1 + ranks.filter((o) => o < r).length),
    };
  }),
});

export const spread = (cat: Category): number => Math.max(...cat.ranking) - Math.min(...cat.ranking);

// Short format: keep the categories with the biggest gap between phones, within a time budget.
export const pickShortCategories = (c: Comparison, budgetSeconds?: number): Comparison => {
  const n = c.phones.length;
  // A Short shows at most one benchmark (the first complete one) and stays at about 50s overall.
  const shortBenchmarks = completeBenchmarks(c).slice(0, 1);
  const budget = budgetSeconds ?? 45 - shortBenchmarks.length * BENCHMARK_SECONDS;
  const scored = c.categories
    .map((cat, i) => ({cat, i, score: spread(cat) * 10 + (cat.weight ?? 1)}))
    .filter((x) => spread(x.cat) > 0)
    .sort((a, b) => b.score - a.score);

  const chosen: typeof scored = [];
  let used = 0;
  for (const s of scored) {
    const sec = categorySeconds(s.cat, n);
    if (used + sec > budget) continue;
    chosen.push(s);
    used += sec;
  }
  if (chosen.length === 0) chosen.push({cat: c.categories[0], i: 0, score: 0});
  chosen.sort((a, b) => a.i - b.i); // restore natural order
  return {...c, categories: chosen.map((x) => x.cat), benchmarks: shortBenchmarks};
};
