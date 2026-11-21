import React from 'react';
import {AbsoluteFill, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {rgba} from '../lib/color';
import {theme} from '../theme';

// One tinted field per phone, taken from that phone's accent color, with a slow drifting glow.
export const Background: React.FC<{accents: string[]; layout: 'columns' | 'rows'; top?: number}> = ({
  accents,
  layout,
  top = 0,
}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const n = accents.length;
  const isCol = layout === 'columns';

  return (
    <AbsoluteFill style={{background: theme.colors.canvas}}>
      {accents.map((accent, i) => {
        const p = spring({frame: frame - i * 3, fps, config: {damping: 200}});
        const drift = Math.sin(frame / 50 + i * 2) * 40;
        const size = isCol ? width / n : (height - top) / n;
        const box: React.CSSProperties = isCol
          ? {left: i * size, top: 0, width: size, height}
          : {left: 0, top: top + i * size, width, height: size};
        const blob = isCol ? size * 1.1 : width * 0.7;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              overflow: 'hidden',
              ...box,
              clipPath: isCol ? `inset(${(1 - p) * 100}% 0 0 0)` : `inset(0 ${(1 - p) * 100}% 0 0)`,
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(180deg, ${rgba(accent, 0.3)} 0%, ${rgba(accent, 0.1)} 100%)`,
              }}
            />
            <div
              style={{
                position: 'absolute',
                width: blob,
                height: blob,
                borderRadius: '50%',
                left: '50%',
                top: '55%',
                transform: `translate(-50%, -50%) translate(${drift}px, ${-drift}px)`,
                background: `radial-gradient(circle, ${rgba(accent, 0.35)} 0%, ${rgba(accent, 0)} 65%)`,
              }}
            />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
