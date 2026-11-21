import React from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {fit} from '../lib/fit';
import {theme} from '../theme';

// Big title that slides up out of a mask. Shrinks automatically for long labels.
export const CategoryTitle: React.FC<{text: string; size: number; maxWidth: number}> = ({text, size, maxWidth}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame, fps, config: {damping: 200}});
  const fontSize = fit(text, size, maxWidth, 0.5);
  return (
    <div style={{overflow: 'hidden', textAlign: 'center', paddingBottom: fontSize * 0.08}}>
      <div
        style={{
          transform: `translateY(${(1 - s) * 110}%)`,
          fontFamily: theme.fonts.display,
          fontWeight: 800,
          fontSize,
          lineHeight: 1.05,
          letterSpacing: '0.01em',
          textTransform: 'uppercase',
          color: theme.colors.ink,
        }}
      >
        {text}
      </div>
    </div>
  );
};
