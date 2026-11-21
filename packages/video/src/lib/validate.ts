import {Comparison} from '../types';

// Fails early (in calculateMetadata) so a bad data file never reaches a render.
export const validateComparison = (c: Comparison): void => {
  const n = c.phones.length;
  if (n < 2 || n > 3) throw new Error(`Comparison ${c.id}: needs 2 or 3 phones, got ${n}`);
  if (c.categories.length === 0) throw new Error(`Comparison ${c.id}: no categories`);
  c.categories.forEach((cat) => {
    if (cat.values.length !== n || cat.ranking.length !== n) {
      throw new Error(`Category ${cat.key}: values/ranking length must equal phone count (${n})`);
    }
    if (!cat.ranking.includes(1)) throw new Error(`Category ${cat.key}: ranking needs at least one rank 1`);
  });
  (c.benchmarks ?? []).forEach((b) => {
    if (b.scores.length !== n) throw new Error(`Benchmark ${b.id}: scores length must equal phone count (${n})`);
    if (b.parts.length > 4) throw new Error(`Benchmark ${b.id}: at most 4 breakdown parts`);
  });
  c.phones.forEach((p) => {
    if (p.image && !p.image.license) throw new Error(`Phone ${p.id}: image without license is not allowed`);
  });
};
