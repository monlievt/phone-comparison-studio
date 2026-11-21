import React from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {fit} from '../lib/fit';
import {Phone} from '../types';
import {theme} from '../theme';

// Black lower band with one name per column and an accent strip on top.
export const NameBar: React.FC<{phones: Phone[]; barHeight: number}> = ({phones, barHeight}) => {
  const frame = useCurrentFrame();
  const {fps, width} = useVideoConfig();
  const s = spring({frame: frame - 2, fps, config: {damping: 200}});
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        bottom: 0,
        width,
        height: barHeight,
        display: 'flex',
        background: theme.colors.ink,
        transform: `translateY(${(1 - s) * 100}%)`,
      }}
    >
      {phones.map((p) => (
        <div
          key={p.id}
          style={{
            flex: 1,
            boxSizing: 'border-box',
            borderTop: `10px solid ${p.accent}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: theme.fonts.display,
            fontWeight: 700,
            fontSize: fit(p.name, 68, (width / phones.length) * 0.9),
            color: theme.colors.white,
          }}
        >
          {p.name}
        </div>
      ))}
    </div>
  );
};
