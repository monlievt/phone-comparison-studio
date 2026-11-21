import React from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {rgba} from '../lib/color';
import {theme} from '../theme';

// Rank 1: green check. Rank 2 (only in 3-way comparisons): silver "2". Others: nothing.
export const RankBadge: React.FC<{rank: number; at: number; size: number; showSecond: boolean}> = ({
  rank,
  at,
  size,
  showSecond,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (frame < at || rank > (showSecond ? 2 : 1)) return null;
  const s = spring({frame: frame - at, fps, config: {damping: 11, stiffness: 170}});
  const first = rank === 1;
  const color = first ? theme.colors.win : theme.colors.silver;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: first ? color : theme.colors.white,
        border: first ? 'none' : `${size * 0.07}px solid ${color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `scale(${s})`,
        boxShadow: first ? `0 0 ${size * 0.6}px ${rgba(color, 0.6)}` : 'none',
        boxSizing: 'border-box',
      }}
    >
      {first ? (
        <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            fill="none"
            stroke="#fff"
            strokeWidth={3.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <span style={{fontFamily: theme.fonts.display, fontWeight: 800, fontSize: size * 0.55, color}}>{rank}</span>
      )}
    </div>
  );
};
