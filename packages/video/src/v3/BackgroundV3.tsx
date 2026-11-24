import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {rgba} from '../lib/color';
import {theme} from '../theme';
import {hashStr, seeded} from './motion';
import {MotionPreset} from './types';

// Never still: a colored glow follows each phone (layer 1) and one motion preset runs underneath (layer 2).
export const BackgroundV3: React.FC<{
  accents: string[];
  glows: {x: number; y: number; size: number}[];
  preset: MotionPreset;
  W: number;
  H: number;
}> = ({accents, glows, preset, W, H}) => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const rnd = seeded(hashStr(accents.join('') + preset));
  const dim = Math.max(W, H);

  const presetLayer = (): React.ReactNode => {
    switch (preset) {
      case 'blobs':
        return accents.concat(accents).map((a, i) => {
          const r = rnd();
          const size = dim * (0.5 + r * 0.3);
          const x = W * (0.2 + 0.6 * ((i * 0.37 + r) % 1)) + Math.sin(t * 0.5 + i * 1.7) * W * 0.08;
          const y = H * (0.2 + 0.6 * ((i * 0.53 + r * 2) % 1)) + Math.cos(t * 0.45 + i * 2.3) * H * 0.06;
          return (
            <div key={i} style={{position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: '50%', background: `radial-gradient(circle, ${rgba(a, 0.2)} 0%, ${rgba(a, 0)} 65%)`}} />
          );
        });
      case 'gridBreath': {
        const cell = 96 + Math.sin(t * 0.9) * 8;
        return (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `linear-gradient(${rgba(theme.colors.ink, 0.06)} 2px, transparent 2px), linear-gradient(90deg, ${rgba(theme.colors.ink, 0.06)} 2px, transparent 2px)`,
              backgroundSize: `${cell}px ${cell}px`,
              backgroundPosition: `${t * 14}px ${t * 9}px`,
            }}
          />
        );
      }
      case 'rotatingShapes':
        return accents.concat(accents[0]).slice(0, 3).map((a, i) => {
          const size = dim * (0.55 + i * 0.12);
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: W * (0.25 + i * 0.25) - size / 2,
                top: H * (0.3 + (i % 2) * 0.35) - size / 2,
                width: size,
                height: size,
                borderRadius: size * 0.22,
                background: rgba(a, 0.09),
                transform: `rotate(${t * (6 + i * 3) * (i % 2 ? -1 : 1) + i * 25}deg)`,
              }}
            />
          );
        });
      default: {
        const ang = 160 + Math.sin(t * 0.35) * 40;
        const mix = (Math.sin(t * 0.4) + 1) / 2;
        return (
          <>
            <div style={{position: 'absolute', inset: 0, background: `linear-gradient(${ang}deg, ${rgba(accents[0], 0.2)} 0%, rgba(255,255,255,0) 60%)`}} />
            <div style={{position: 'absolute', inset: 0, opacity: 0.5 + mix * 0.5, background: `linear-gradient(${ang + 180}deg, ${rgba(accents[accents.length - 1], 0.2)} 0%, rgba(255,255,255,0) 60%)`}} />
          </>
        );
      }
    }
  };

  return (
    <AbsoluteFill style={{background: theme.colors.canvas, overflow: 'hidden'}}>
      {presetLayer()}
      {glows.map((g, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: g.x - g.size / 2,
            top: g.y - g.size / 2,
            width: g.size,
            height: g.size,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${rgba(accents[i], 0.42)} 0%, ${rgba(accents[i], 0)} 68%)`,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};
