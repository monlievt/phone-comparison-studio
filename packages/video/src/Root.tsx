import React from 'react';
import {CalculateMetadataFunction, Composition, Still} from 'remotion';
import {CategoryVertical} from './CategoryVertical';
import {BenchmarkSegment} from './BenchmarkSegment';
import {CategoryWide} from './CategoryWide';
import {LongVideo} from './LongVideo';
import {ShortVideo} from './ShortVideo';
import {Thumbnail} from './Thumbnail';
import {demo2, demo3} from './data/demo';
import {pickShortCategories} from './lib/rank';
import {isComplete} from './lib/benchmark';
import {BENCHMARK_SECONDS, categoryFrames, FPS, longVideoFrames, shortVideoFrames} from './lib/timing';
import {validateComparison} from './lib/validate';
import {BenchmarkProps, SegmentProps, VideoProps} from './types';

const segmentMeta: CalculateMetadataFunction<SegmentProps> = ({props}) => {
  validateComparison(props.comparison);
  const cat = props.comparison.categories[props.categoryIndex];
  return {durationInFrames: categoryFrames(cat, props.comparison.phones.length)};
};

const benchmarkMeta: CalculateMetadataFunction<BenchmarkProps> = ({props}) => {
  validateComparison(props.comparison);
  const b = props.comparison.benchmarks?.[props.benchmarkIndex];
  if (!b || !isComplete(b, props.comparison.phones.length)) {
    throw new Error('Benchmark segment needs a score for every phone');
  }
  return {durationInFrames: BENCHMARK_SECONDS * FPS};
};

const longMeta: CalculateMetadataFunction<VideoProps> = ({props}) => {
  validateComparison(props.comparison);
  return {durationInFrames: longVideoFrames(props.comparison)};
};

const shortMeta: CalculateMetadataFunction<VideoProps> = ({props}) => {
  validateComparison(props.comparison);
  return {durationInFrames: shortVideoFrames(pickShortCategories(props.comparison))};
};

const wide = {width: 1920, height: 1080, fps: FPS} as const;
const vertical = {width: 1080, height: 1920, fps: FPS} as const;

export const RemotionRoot: React.FC = () => (
  <>
    {([['2', demo2], ['3', demo3]] as const).map(([k, cmp]) => (
      <React.Fragment key={k}>
        <Composition
          id={`CategoryWide${k}`}
          component={CategoryWide}
          {...wide}
          durationInFrames={180}
          defaultProps={{comparison: cmp, categoryIndex: 0}}
          calculateMetadata={segmentMeta}
        />
        <Composition
          id={`CategoryVertical${k}`}
          component={CategoryVertical}
          {...vertical}
          durationInFrames={180}
          defaultProps={{comparison: cmp, categoryIndex: 0}}
          calculateMetadata={segmentMeta}
        />
        <Composition
          id={`BenchmarkWide${k}`}
          component={BenchmarkSegment}
          {...wide}
          durationInFrames={BENCHMARK_SECONDS * FPS}
          defaultProps={{comparison: cmp, benchmarkIndex: 0}}
          calculateMetadata={benchmarkMeta}
        />
        <Composition
          id={`BenchmarkVertical${k}`}
          component={BenchmarkSegment}
          {...vertical}
          durationInFrames={BENCHMARK_SECONDS * FPS}
          defaultProps={{comparison: cmp, benchmarkIndex: 0}}
          calculateMetadata={benchmarkMeta}
        />
        <Composition
          id={`LongVideo${k}`}
          component={LongVideo}
          {...wide}
          durationInFrames={900}
          defaultProps={{comparison: cmp}}
          calculateMetadata={longMeta}
        />
        <Composition
          id={`ShortVideo${k}`}
          component={ShortVideo}
          {...vertical}
          durationInFrames={900}
          defaultProps={{comparison: cmp}}
          calculateMetadata={shortMeta}
        />
        <Still
          id={`Thumbnail${k}`}
          component={Thumbnail}
          width={1280}
          height={720}
          defaultProps={{comparison: cmp}}
        />
      </React.Fragment>
    ))}
  </>
);
