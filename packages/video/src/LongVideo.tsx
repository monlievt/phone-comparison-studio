import React from 'react';
import {AbsoluteFill, Series} from 'remotion';
import {CategoryWide} from './CategoryWide';
import {Music} from './components/Sfx';
import {BenchmarkSegment} from './BenchmarkSegment';
import {completeBenchmarkIndexes} from './lib/benchmark';
import {BENCHMARK_SECONDS, categoryFrames, FPS} from './lib/timing';
import {Intro} from './components/Intro';
import {ScoreRecap} from './components/ScoreRecap';
import {Outro} from './components/Outro';
import {VideoProps} from './types';

export const INTRO_SECONDS = 5;
export const RECAP_SECONDS = 8;
export const OUTRO_SECONDS = 6;

// Long Video (16:9 1080p): Intro -> Categories -> Benchmarks -> Score Recap -> Outro
export const LongVideo: React.FC<VideoProps> = ({comparison}) => {
  const n = comparison.phones.length;
  return (
    <AbsoluteFill>
      <Series>
        {/* 1. Intro Segment (5s) */}
        <Series.Sequence durationInFrames={INTRO_SECONDS * FPS}>
          <Intro comparison={comparison} />
        </Series.Sequence>

        {/* 2. Category Segments */}
        {comparison.categories.map((c, i) => (
          <Series.Sequence key={c.key} durationInFrames={categoryFrames(c, n)}>
            <CategoryWide comparison={comparison} categoryIndex={i} />
          </Series.Sequence>
        ))}

        {/* 3. Benchmark Segments */}
        {completeBenchmarkIndexes(comparison).map((bi) => (
          <Series.Sequence key={`benchmark-${bi}`} durationInFrames={BENCHMARK_SECONDS * FPS}>
            <BenchmarkSegment comparison={comparison} benchmarkIndex={bi} />
          </Series.Sequence>
        ))}

        {/* 4. Score Recap (8s) */}
        <Series.Sequence durationInFrames={RECAP_SECONDS * FPS}>
          <ScoreRecap comparison={comparison} />
        </Series.Sequence>

        {/* 5. Outro (6s) */}
        <Series.Sequence durationInFrames={OUTRO_SECONDS * FPS}>
          <Outro comparison={comparison} />
        </Series.Sequence>
      </Series>
      <Music />
    </AbsoluteFill>
  );
};

