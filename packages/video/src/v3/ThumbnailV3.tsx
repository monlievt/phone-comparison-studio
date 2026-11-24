import React from 'react';
import {AbsoluteFill} from 'remotion';
import {rgba} from '../lib/color';
import {fit} from '../lib/fit';
import {theme} from '../theme';
import {Comparison} from '../types';
import {PhoneActor, phoneHeight} from './PhoneActor';

// 1280x720 still. High contrast, at most four words. Not AI-written: the text comes from a template rule.
export const ThumbnailV3: React.FC<{comparison: Comparison; text?: string}> = ({comparison, text = 'WHO WINS?'}) => {
  const W = 1280;
  const H = 720;
  const ps = comparison.phones;
  const n = ps.length;
  const w = n === 2 ? 270 : 225;
  const size = fit(text, 150, W * 0.9, 0.5);

  return (
    <AbsoluteFill style={{background: theme.colors.canvas, overflow: 'hidden'}}>
      {ps.map((p, i) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: (W / n) * i,
            width: W / n,
            background: `linear-gradient(180deg, ${rgba(p.accent, 0.5)} 0%, ${rgba(p.accent, 0.18)} 100%)`,
          }}
        />
      ))}
      <div style={{position: 'absolute', left: 0, right: 0, top: 22, textAlign: 'center', fontFamily: theme.fonts.display, fontWeight: 800, fontSize: size, lineHeight: 1, color: theme.colors.ink, textTransform: 'uppercase', textShadow: '0 4px 0 rgba(255,255,255,0.9)'}}>
        {text}
      </div>
      {ps.map((p, i) => {
        const cx = (W / n) * (i + 0.5);
        const h = phoneHeight(p, w);
        return (
          <PhoneActor
            key={p.id}
            phone={p}
            pose={{cx, top: H - h * 0.8 - 30 + (i % 2) * 14, w, rot: (i - (n - 1) / 2) * 6, op: 1, glow: 0.8}}
            chipSize={42}
          />
        );
      })}
      {ps.slice(1).map((p, i) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: (W / n) * (i + 1) - 62,
            top: H * 0.5,
            width: 124,
            height: 124,
            borderRadius: '50%',
            background: theme.colors.ink,
            color: '#fff',
            fontFamily: theme.fonts.display,
            fontWeight: 800,
            fontSize: 58,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 0 8px ${theme.colors.canvas}`,
          }}
        >
          VS
        </div>
      ))}
    </AbsoluteFill>
  );
};
