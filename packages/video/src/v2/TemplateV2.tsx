import React, {useMemo} from 'react';
import {AbsoluteFill, Sequence, useVideoConfig} from 'remotion';
import {Music} from '../components/Sfx';
import {theme} from '../theme';
import {layout} from './layout';
import {buildPlan} from './plan';
import {Stage} from './Stage';
import {Transitions} from './Transitions';
import {Orient, V2Props} from './types';
import {BenchmarkContent} from './sections/BenchmarkContent';
import {CategoryContent} from './sections/CategoryContent';
import {IntroContent} from './sections/IntroContent';
import {OutroContent} from './sections/OutroContent';
import {RecapContent} from './sections/RecapContent';
import {Exit} from './sections/shared';

// Template V2: one persistent stage (background, camera, phones) + content sections that overlap and swap on top of it.
export const TemplateV2: React.FC<V2Props> = ({comparison, format = 'long', motionPreset, seed}) => {
  const {width, height} = useVideoConfig();
  const orient: Orient = width > height ? 'land' : 'port';
  const plan = useMemo(() => buildPlan(comparison, format, seed, motionPreset), [comparison, format, seed, motionPreset]);
  const L = layout(orient, plan.src.phones.length);

  return (
    <AbsoluteFill style={{fontFamily: theme.fonts.text}}>
      <Stage plan={plan} orient={orient} />
      {plan.sections.map((s, k) => {
        const last = k === plan.sections.length - 1;
        const props = {src: plan.src, section: s, orient, L, last};
        const content =
          s.kind === 'category' ? <CategoryContent {...props} /> :
          s.kind === 'benchmark' ? <BenchmarkContent {...props} /> :
          s.kind === 'recap' ? <RecapContent {...props} /> :
          s.kind === 'outro' || s.kind === 'winner' ? <OutroContent {...props} /> :
          <IntroContent {...props} />;
        return (
          <Sequence key={`${s.kind}-${k}`} from={s.start} durationInFrames={s.dur}>
            <Exit total={s.dur} enabled={!last}>{content}</Exit>
          </Sequence>
        );
      })}
      <Transitions plan={plan} />
      <Music />
    </AbsoluteFill>
  );
};
