import React from 'react';
import {AbsoluteFill, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Background} from './Background';
import {PhoneMock} from './PhoneMock';
import {VsBadge} from './VsBadge';
import {theme} from '../theme';
import {Comparison} from '../types';

export const ShortHook: React.FC<{comparison: Comparison}> = ({comparison}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const phones = comparison.phones;
  const n = phones.length;

  const hookText = comparison.hook ?? 'SAME PRICE. WHO WINS?';
  const enter = spring({frame, fps, config: {damping: 15, stiffness: 120}});

  // Layout for vertical 1080x1920
  const phoneWidth = n >= 3 ? 240 : 340;
  const gap = n >= 3 ? 40 : 80;
  const startX = (1080 - (n * phoneWidth + (n - 1) * gap)) / 2;

  return (
    <AbsoluteFill>
      <Background accents={phones.map((p) => p.accent)} layout="columns" />

      {/* Top Hook Banner */}
      <div
        style={{
          position: 'absolute',
          top: 180,
          width: '100%',
          textAlign: 'center',
          padding: '0 40px',
          boxSizing: 'border-box',
          opacity: enter,
          transform: `scale(${0.85 + enter * 0.15})`,
        }}
      >
        <div
          style={{
            fontFamily: theme.fonts.display,
            fontSize: 72,
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            lineHeight: 1.1,
            textShadow: '0 4px 30px rgba(0,0,0,0.8)',
          }}
        >
          {hookText}
        </div>
      </div>

      {/* Phones Row */}
      {phones.map((phone, i) => {
        const x = startX + i * (phoneWidth + gap);
        return (
          <div
            key={phone.id}
            style={{
              position: 'absolute',
              left: x,
              bottom: 380,
            }}
          >
            <PhoneMock
              phone={phone}
              width={phoneWidth}
              enterAt={i * 4}
              revealAt={25}
              rank={1}
              phoneCount={n}
            />
          </div>
        );
      })}

      {/* Center VS Badge */}
      <div style={{position: 'absolute', left: 540 - 55, bottom: 680}}>
        <VsBadge x={55} y={55} size={110} delay={15} />
      </div>
    </AbsoluteFill>
  );
};
