// packages/collectors/src/pairs/pair-finder.ts
// Proposes phone pairs/trios worth comparing and calculates comparability score (0-100).
// Specification: docs/MODULES.md §1

export interface PhoneCandidateForPair {
  id: string;
  brand: string;
  model: string;
  priceUSD: number;
  socTier?: number;
  releaseDate?: string; // ISO date
  hasSpecs?: boolean;
  hasBenchmarks?: boolean;
}

export interface ProposedTopic {
  phoneIds: string[];
  phoneNames: string[];
  score: number;       // 0-100
  reasons: string[];
  angle: string;
}

export function calculatePairScore(p1: PhoneCandidateForPair, p2: PhoneCandidateForPair): { score: number; reasons: string[] } | null {
  // Hard filters
  const priceGap = Math.abs(p1.priceUSD - p2.priceUSD);
  const avgPrice = (p1.priceUSD + p2.priceUSD) / 2;
  const maxPriceAllowedGap = Math.max(40, avgPrice * 0.15);

  const socGap = p1.socTier !== undefined && p2.socTier !== undefined
    ? Math.abs(p1.socTier - p2.socTier)
    : undefined;

  const passesPriceFilter = priceGap <= maxPriceAllowedGap;
  const passesSocFilter = socGap !== undefined && socGap <= 1 && (priceGap / avgPrice) <= 0.35;

  if (!passesPriceFilter && !passesSocFilter) {
    return null; // Does not qualify for comparison
  }

  const reasons: string[] = [];

  // 1. Price Closeness (weight 0.30)
  // Closer prices -> higher score
  const priceCloseness = Math.max(0, 100 - (priceGap / Math.max(1, avgPrice)) * 100);
  reasons.push(`Price difference is only $${Math.round(priceGap)}`);

  // 2. SoC Similarity (weight 0.30)
  let socSimilarity = 50;
  if (socGap !== undefined) {
    socSimilarity = Math.max(0, 100 - socGap * 15);
    if (socGap <= 1) {
      reasons.push('Comparable chipset performance tier');
    }
  }

  // 3. Recency (weight 0.15)
  let recencyScore = 80;
  if (p1.releaseDate && p2.releaseDate) {
    const d1 = new Date(p1.releaseDate).getTime();
    const d2 = new Date(p2.releaseDate).getTime();
    const now = Date.now();
    const diffMonths1 = Math.abs(now - d1) / (1000 * 60 * 60 * 24 * 30);
    const diffMonths2 = Math.abs(now - d2) / (1000 * 60 * 60 * 24 * 30);
    if (diffMonths1 <= 12 && diffMonths2 <= 12) {
      recencyScore = 100;
      reasons.push('Both phones released within the last 12 months');
    }
  }

  // 4. Data availability (weight 0.15)
  let dataAvail = 70;
  if (p1.hasSpecs && p2.hasSpecs) dataAvail += 15;
  if (p1.hasBenchmarks && p2.hasBenchmarks) dataAvail += 15;

  // 5. Rivalry bonus (weight 0.10)
  let rivalry = 50;
  if (p1.brand.toLowerCase() !== p2.brand.toLowerCase()) {
    rivalry = 100;
    reasons.push(`Cross-brand rivalry: ${p1.brand} vs ${p2.brand}`);
  }

  const totalScore = Math.round(
    0.30 * priceCloseness +
    0.30 * socSimilarity +
    0.15 * recencyScore +
    0.15 * dataAvail +
    0.10 * rivalry
  );

  return {
    score: Math.min(100, Math.max(0, totalScore)),
    reasons,
  };
}

export function proposePairs(candidates: PhoneCandidateForPair[], minScore = 60): ProposedTopic[] {
  const topics: ProposedTopic[] = [];

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const p1 = candidates[i];
      const p2 = candidates[j];

      const scored = calculatePairScore(p1, p2);
      if (scored && scored.score >= minScore) {
        topics.push({
          phoneIds: [p1.id, p2.id],
          phoneNames: [`${p1.brand} ${p1.model}`, `${p2.brand} ${p2.model}`],
          score: scored.score,
          reasons: scored.reasons,
          angle: `${p1.brand} vs ${p2.brand}: Similar Price, Different Strengths`,
        });
      }
    }
  }

  // Sort descending by score
  return topics.sort((a, b) => b.score - a.score);
}
