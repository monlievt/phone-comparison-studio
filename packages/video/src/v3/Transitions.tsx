import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {rgba} from '../lib/color';
import {easeIn, easeInOut, easeOut, lerp} from './motion';
import {Plan} from './types';

const LEAD = 5; // overlay starts before the new section so the swap happens under cover
const LEN = 26;

// Object wipes that hide the content swap. 'circle' = accent iris, 'band' = skewed accent sweep.
// 'slide' and 'flipIn' have no overlay (they are content enter styles).
export const Transitions: React.FC<{plan: Plan}> = ({plan}) => {
  const frame = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const land = W > H;
  const n = plan.src.phones.length;
  const nodes: React.ReactNode[] = [];

  plan.sections.forEach((s, k) => {
    if (k === 0 || (s.transition !== 'circle' && s.transition !== 'band')) return;
    const u = (frame - (s.start - LEAD)) / LEN;
    if (u < 0 || u > 1) return;
    const accent = plan.src.phones[k % n].accent;
    if (s.transition === 'circle') {
      const cx = W / 2;
      const cy = H * 0.58;
      const R = Math.hypot(W, H) * 0.75;
      if (u < 0.5) {
        const r = easeIn(u / 0.5) * R;
        nodes.push(<div key={k} style={{position: 'absolute', inset: 0, background: accent, clipPath: `circle(${r}px at ${cx}px ${cy}px)`}} />);
      } else {
        const r = easeOut((u - 0.5) / 0.5) * R;
        nodes.push(<div key={k} style={{position: 'absolute', inset: 0, background: `radial-gradient(circle at ${cx}px ${cy}px, rgba(0,0,0,0) ${r}px, ${accent} ${r + 2}px)`}} />);
      }
    } else {
      const p = easeInOut(u);
      const thick = (land ? W : H) * 0.75;
      const pos = lerp(-thick, land ? W : H, p);
      nodes.push(
        land ? (
          <div key={k} style={{position: 'absolute', top: -80, bottom: -80, left: pos, width: thick, background: accent, transform: 'skewX(-14deg)', boxShadow: `-30px 0 0 ${rgba('#FFFFFF', 0.5)}`}} />
        ) : (
          <div key={k} style={{position: 'absolute', left: -80, right: -80, top: pos, height: thick, background: accent, transform: 'skewY(-8deg)', boxShadow: `0 -30px 0 ${rgba('#FFFFFF', 0.5)}`}} />
        ),
      );
    }
  });
  return <AbsoluteFill style={{pointerEvents: 'none', overflow: 'hidden'}}>{nodes}</AbsoluteFill>;
};
