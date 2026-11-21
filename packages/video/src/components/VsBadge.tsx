import React from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme} from '../theme';

export const VsBadge: React.FC<{x: number; y: number; size: number; delay?: number}> = ({x, y, size, delay = 10}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - delay, fps, config: {damping: 12, stiffness: 160}});
  return (
    <div
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: '50%',
        background: theme.colors.ink,
        color: theme.colors.white,
        fontFamily: theme.fonts.display,
        fontWeight: 800,
        fontSize: size * 0.46,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `scale(${s})`,
        boxShadow: `0 0 0 ${size * 0.07}px ${theme.colors.canvas}`,
      }}
    >
      VS
    </div>
  );
};
