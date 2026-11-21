import React from 'react';
import {AbsoluteFill, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Background} from './Background';
import {PhoneMock} from './PhoneMock';
import {theme} from '../theme';
import {Comparison} from '../types';

export const Outro: React.FC<{comparison: Comparison}> = ({comparison}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const phones = comparison.phones;

  const winnerIdx = comparison.overall?.ranking.indexOf(1) ?? 0;
  const winnerPhone = phones[winnerIdx >= 0 ? winnerIdx : 0];

  const enter = spring({frame, fps, config: {damping: 14, stiffness: 100}});

  return (
    <AbsoluteFill>
      <Background phones={phones} />

      <div
        style={{
          position: 'absolute',
          top: 140,
          width: '100%',
          textAlign: 'center',
          opacity: enter,
          transform: `translateY(${(1 - enter) * -40}px)`,
        }}
      >
        <div
          style={{
            fontFamily: theme.fonts.display,
            fontSize: 48,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.7)',
            letterSpacing: '2px',
          }}
        >
          OVERALL COMPARISON WINNER
        </div>
        <div
          style={{
            marginTop: 8,
            fontFamily: theme.fonts.display,
            fontSize: 72,
            fontWeight: 900,
            color: '#ffffff',
            textTransform: 'uppercase',
            letterSpacing: '2px',
          }}
        >
          🏆 {winnerPhone.name}
        </div>
      </div>

      {/* Winner Phone Centered */}
      <div
        style={{
          position: 'absolute',
          left: 960 - 160,
          bottom: 160,
        }}
      >
        <PhoneMock
          phone={winnerPhone}
          width={320}
          enterAt={10}
          revealAt={25}
          rank={1}
          phoneCount={1}
        />
      </div>

      {/* Outro Call To Action Footer */}
      <div
        style={{
          position: 'absolute',
          bottom: 60,
          width: '100%',
          textAlign: 'center',
          fontFamily: theme.fonts.display,
          fontSize: 26,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.85)',
          letterSpacing: '1px',
        }}
      >
        SUBSCRIBE FOR MORE DETAILED SMARTPHONE REVIEWS & COMPARISONS
      </div>
    </AbsoluteFill>
  );
};
