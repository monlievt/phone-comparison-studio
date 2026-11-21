import {Category, Comparison} from '../types';
import {completeBenchmarkIndexes} from './benchmark';

export const FPS = 30;

const longestText = (c: Category): number =>
  Math.max(...c.values.flatMap((v) => [v.primary.length, v.secondary?.length ?? 0]));

// Duration follows the spec text: 6s for 2 phones, 7s for 3 phones, +1s/+2s for long values.
export const categorySeconds = (c: Category, phoneCount: number): number => {
  const base = phoneCount >= 3 ? 7 : 6;
  const l = longestText(c);
  return base + (l > 16 ? 1 : 0) + (l > 28 ? 1 : 0);
};

export const categoryFrames = (c: Category, phoneCount: number): number =>
  Math.round(categorySeconds(c, phoneCount) * FPS);

export const BENCHMARK_SECONDS = 8;

export const benchmarkFrames = (cmp: Comparison): number =>
  completeBenchmarkIndexes(cmp).length * BENCHMARK_SECONDS * FPS;

// Category segments + one segment per complete benchmark.
export const sequenceFrames = (cmp: Comparison): number =>
  cmp.categories.reduce((sum, c) => sum + categoryFrames(c, cmp.phones.length), 0) + benchmarkFrames(cmp);

export const INTRO_FRAMES = 5 * FPS;  // 150 frames (5s)
export const RECAP_FRAMES = 8 * FPS;  // 240 frames (8s)
export const OUTRO_FRAMES = 6 * FPS;  // 180 frames (6s)

export const SHORT_HOOK_FRAMES = 2 * FPS;   // 60 frames (2s)
export const SHORT_WINNER_FRAMES = 3 * FPS; // 90 frames (3s)

// Total duration for complete Long Video composition
export const longVideoFrames = (cmp: Comparison): number =>
  INTRO_FRAMES + sequenceFrames(cmp) + RECAP_FRAMES + OUTRO_FRAMES;

// Total duration for vertical Short Video composition
export const shortVideoFrames = (shortCmp: Comparison): number =>
  SHORT_HOOK_FRAMES + sequenceFrames(shortCmp) + SHORT_WINNER_FRAMES;

// Timeline of one category segment (frames @30fps).
export const T = {
  phoneIn: 6,
  phoneStagger: 4,
  valueIn: 30,
  valueStagger: 6,
  badgeGap: 34,
} as const;

export const badgeAt = (phoneCount: number): number =>
  T.valueIn + (phoneCount - 1) * T.valueStagger + T.badgeGap;
