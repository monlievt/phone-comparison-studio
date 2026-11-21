import React from 'react';
import {AbsoluteFill, Series} from 'remotion';
import {CategoryVertical} from './CategoryVertical';
import {Music} from './components/Sfx';
import {pickShortCategories} from './lib/rank';
import {BenchmarkSegment} from './BenchmarkSegment';
import {completeBenchmarkIndexes} from './lib/benchmark';
import {BENCHMARK_SECONDS, categoryFrames, FPS} from './lib/timing';
import {ShortHook} from './components/ShortHook';
import {ShortWinner} from './components/ShortWinner';
import {VideoProps} from './types';

export const SHORT_HOOK_SECONDS = 2;
export const SHORT_WINNER_SECONDS = 3;

// Vertical Short (9:16): Hook (2s) -> Highlighted Categories -> Benchmark (max 1) -> Winner (3s)
export const ShortVideo: React.FC<VideoProps> = ({comparison}) => {
  const short = pickShortCategories(comparison);
  const n = short.phones.length;
  return (
    <AbsoluteFill>
      <Series>
        {/* 1. Fast Hook (2s) */}
        <Series.Sequence durationInFrames={SHORT_HOOK_SECONDS * FPS}>
          <ShortHook comparison={short} />
        </Series.Sequence>

        {/* 2. Key Highlight Categories */}
        {short.categories.map((c, i) => (
          <Series.Sequence key={c.key} durationInFrames={categoryFrames(c, n)}>
            <CategoryVertical comparison={short} categoryIndex={i} />
          </Series.Sequence>
        ))}

        {/* 3. Single Benchmark (if available) */}
        {completeBenchmarkIndexes(short).slice(0, 1).map((bi) => (
          <Series.Sequence key={`benchmark-${bi}`} durationInFrames={BENCHMARK_SECONDS * FPS}>
            <BenchmarkSegment comparison={short} benchmarkIndex={bi} />
          </Series.Sequence>
        ))}

        {/* 4. Quick Winner Reveal (3s) */}
        <Series.Sequence durationInFrames={SHORT_WINNER_SECONDS * FPS}>
          <ShortWinner comparison={short} />
        </Series.Sequence>
      </Series>
      <Music />
    </AbsoluteFill>
  );
};

