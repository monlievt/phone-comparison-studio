import React from 'react';
import {AbsoluteFill, Series} from 'remotion';
import {CategoryWide} from './CategoryWide';
import {Music} from './components/Sfx';
import {BenchmarkSegment} from './BenchmarkSegment';
import {completeBenchmarkIndexes} from './lib/benchmark';
import {BENCHMARK_SECONDS, categoryFrames, FPS} from './lib/timing';
import {VideoProps} from './types';

// Category segments back to back, then one segment per benchmark that every phone has a score for.
// Intro, recap and outro are the next step.
export const LongVideo: React.FC<VideoProps> = ({comparison}) => {
  const n = comparison.phones.length;
  return (
    <AbsoluteFill>
      <Series>
        {comparison.categories.map((c, i) => (
          <Series.Sequence key={c.key} durationInFrames={categoryFrames(c, n)}>
            <CategoryWide comparison={comparison} categoryIndex={i} />
          </Series.Sequence>
        ))}
        {completeBenchmarkIndexes(comparison).map((bi) => (
          <Series.Sequence key={`benchmark-${bi}`} durationInFrames={BENCHMARK_SECONDS * FPS}>
            <BenchmarkSegment comparison={comparison} benchmarkIndex={bi} />
          </Series.Sequence>
        ))}
      </Series>
      <Music />
    </AbsoluteFill>
  );
};
