import React from 'react';
import {AbsoluteFill, Series} from 'remotion';
import {CategoryVertical} from './CategoryVertical';
import {Music} from './components/Sfx';
import {pickShortCategories} from './lib/rank';
import {BenchmarkSegment} from './BenchmarkSegment';
import {completeBenchmarkIndexes} from './lib/benchmark';
import {BENCHMARK_SECONDS, categoryFrames, FPS} from './lib/timing';
import {VideoProps} from './types';

// Vertical Short: only the categories with the biggest gap between phones. Hook and final winner are the next step.
export const ShortVideo: React.FC<VideoProps> = ({comparison}) => {
  const short = pickShortCategories(comparison);
  const n = short.phones.length;
  return (
    <AbsoluteFill>
      <Series>
        {short.categories.map((c, i) => (
          <Series.Sequence key={c.key} durationInFrames={categoryFrames(c, n)}>
            <CategoryVertical comparison={short} categoryIndex={i} />
          </Series.Sequence>
        ))}
        {completeBenchmarkIndexes(short).map((bi) => (
          <Series.Sequence key={`benchmark-${bi}`} durationInFrames={BENCHMARK_SECONDS * FPS}>
            <BenchmarkSegment comparison={short} benchmarkIndex={bi} />
          </Series.Sequence>
        ))}
      </Series>
      <Music />
    </AbsoluteFill>
  );
};
