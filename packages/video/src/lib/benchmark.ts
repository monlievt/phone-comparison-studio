import {BenchmarkData, BenchmarkScoreSet, Comparison} from '../types';

export const isComplete = (b: BenchmarkData, phoneCount: number): boolean =>
  b.scores.length === phoneCount && b.scores.every((s) => s !== null);

// Indexes (inside comparison.benchmarks) of the benchmarks that every phone has a score for.
export const completeBenchmarkIndexes = (c: Comparison): number[] =>
  (c.benchmarks ?? []).flatMap((b, i) => (isComplete(b, c.phones.length) ? [i] : []));

export const completeBenchmarks = (c: Comparison): BenchmarkData[] =>
  completeBenchmarkIndexes(c).map((i) => c.benchmarks![i]);

// Rank by main score. Equal scores share a rank.
export const benchmarkRanks = (scores: BenchmarkScoreSet[], lowerIsBetter = false): number[] =>
  scores.map((s) => 1 + scores.filter((o) => (lowerIsBetter ? o.main < s.main : o.main > s.main)).length);

export const fmtMain = (n: number): string => Math.round(n).toLocaleString('en-US');
export const fmtPart = (n: number): string => (n >= 10000 ? `${Math.round(n / 1000)}K` : fmtMain(n));

export const benchmarkSubtitle = (b: BenchmarkData): string =>
  b.subtitle ?? [`${b.source} ${b.version}`, b.updated, b.note].filter(Boolean).join(' · ');

// Derived segment: points per US dollar = benchmark main score / launch price. Needs priceUSD on every phone.
export const valueBenchmark = (c: Comparison, sourceId = 'antutu'): BenchmarkData | null => {
  const src = c.benchmarks?.find((b) => b.id === sourceId);
  if (!src || !isComplete(src, c.phones.length) || c.phones.some((p) => p.priceUSD == null)) return null;
  return {
    id: 'value',
    source: 'Calculated',
    title: 'Performance per dollar',
    version: src.version,
    updated: src.updated,
    sourceUrl: src.sourceUrl,
    subtitle: `${src.source} ${src.version} score ÷ launch price (USD) · points per US dollar`,
    parts: [],
    scores: src.scores.map((s, i) => ({main: s!.main / c.phones[i].priceUSD!, parts: {}})),
  };
};
