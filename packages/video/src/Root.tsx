import React from 'react';
import {CalculateMetadataFunction, Composition, Still} from 'remotion';
import {CategoryVertical} from './CategoryVertical';
import {BenchmarkSegment} from './BenchmarkSegment';
import {CategoryWide} from './CategoryWide';
import {LongVideo} from './LongVideo';
import {ShortVideo} from './ShortVideo';
import {Thumbnail} from './Thumbnail';
import {TemplateV2} from './v2/TemplateV2';
import {ThumbnailV2} from './v2/ThumbnailV2';
import {buildPlan, checkPlan} from './v2/plan';
import {V2Props} from './v2/types';
import {TemplateV3} from './v3/TemplateV3';
import {ThumbnailV3} from './v3/ThumbnailV3';
import {buildPlan as buildPlanV3, checkPlan as checkPlanV3} from './v3/plan';
import {V3Props} from './v3/types';
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

// Template V2: persistent stage, camera, overlapping sections, parametric phones, intro/recap/outro/hook/winner.
const v2Meta: CalculateMetadataFunction<V2Props> = ({props}) => {
  validateComparison(props.comparison);
  const plan = buildPlan(props.comparison, props.format ?? 'long', props.seed, props.motionPreset);
  const issues = checkPlan(plan);
  if (issues.length) throw new Error(`V2 plan: ${issues.join('; ')}`);
  return {durationInFrames: plan.total};
};

// Template V3: Claude's V3 architecture with persistent stage & transitions
const v3Meta: CalculateMetadataFunction<V3Props> = ({props}) => {
  validateComparison(props.comparison);
  const plan = buildPlanV3(props.comparison, props.format ?? 'long', props.seed, props.motionPreset);
  const issues = checkPlanV3(plan);
  if (issues.length) throw new Error(`V3 plan: ${issues.join('; ')}`);
  return {durationInFrames: plan.total};
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
        <Composition
          id={`LongV2-${k}`}
          component={TemplateV2}
          {...wide}
          durationInFrames={900}
          defaultProps={{comparison: cmp, format: 'long' as const}}
          calculateMetadata={v2Meta}
        />
        <Composition
          id={`ShortV2-${k}`}
          component={TemplateV2}
          {...vertical}
          durationInFrames={900}
          defaultProps={{comparison: cmp, format: 'short' as const}}
          calculateMetadata={v2Meta}
        />
        <Still
          id={`ThumbnailV2-${k}`}
          component={ThumbnailV2}
          width={1280}
          height={720}
          defaultProps={{comparison: cmp, text: 'WHO WINS?'}}
        />
        <Composition
          id={`LongV3-${k}`}
          component={TemplateV3}
          {...wide}
          durationInFrames={900}
          defaultProps={{comparison: cmp, format: 'long' as const}}
          calculateMetadata={v3Meta}
        />
        <Composition
          id={`ShortV3-${k}`}
          component={TemplateV3}
          {...vertical}
          durationInFrames={900}
          defaultProps={{comparison: cmp, format: 'short' as const}}
          calculateMetadata={v3Meta}
        />
        <Still
          id={`ThumbnailV3-${k}`}
          component={ThumbnailV3}
          width={1280}
          height={720}
          defaultProps={{comparison: cmp, text: 'WHO WINS?'}}
        />
      </React.Fragment>
    ))}
  </>
);
