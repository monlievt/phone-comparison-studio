import React from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {fit} from '../lib/fit';
import {rgba} from '../lib/color';
import {useEmphasis} from '../lib/emphasis';
import {CategoryValue} from '../types';
import {theme} from '../theme';

// The spec value lives on its own card, never on top of the phone screen (keeps it readable).
export const StatCard: React.FC<{
  value: CategoryValue;
  accent: string;
  width: number;
  height: number;
  baseSize: number;
  delay: number;
  revealAt: number;
  rank: number;
  phoneCount: number;
}> = ({value, accent, width, height, baseSize, delay, revealAt, rank, phoneCount}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame: frame - delay, fps, config: {damping: 14, stiffness: 150}});
  const emph = useEmphasis(revealAt, rank, phoneCount);
  const pad = width * 0.06;
  const primarySize = fit(value.primary, baseSize, width - pad * 2);
  const secondarySize = value.secondary ? Math.min(baseSize * 0.34, fit(value.secondary, 60, width - pad * 2, 0.55)) : 0;

  return (
    <div
      style={{
        width,
        height,
        boxSizing: 'border-box',
        borderRadius: 30,
        background: 'rgba(255,255,255,0.8)',
        border: `${emph.glow > 0.5 ? 5 : 3}px solid ${emph.glow > 0.5 ? accent : 'rgba(20,23,28,0.08)'}`,
        boxShadow: `0 18px 40px rgba(20,23,28,0.12), 0 0 ${60 * emph.glow}px ${rgba(accent, 0.5 * emph.glow)}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: secondarySize * 0.15,
        opacity: enter * emph.opacity,
        transform: `scale(${(0.86 + 0.14 * enter) * emph.scale})`,
      }}
    >
      <div style={{fontFamily: theme.fonts.display, fontWeight: 800, fontSize: primarySize, lineHeight: 1, color: theme.colors.ink}}>
        {value.primary}
      </div>
      {value.secondary ? (
        <div style={{fontFamily: theme.fonts.text, fontWeight: 700, fontSize: secondarySize, color: theme.colors.inkSoft}}>
          {value.secondary}
        </div>
      ) : null}
    </div>
  );
};
