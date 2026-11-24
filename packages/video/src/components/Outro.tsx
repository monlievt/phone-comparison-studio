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
      <Background accents={phones.map((p) => p.accent)} layout="columns" />

      {/* Winner Title Header: Cleanly positioned at top 40px */}
      <div
        style={{
          position: 'absolute',
          top: 36,
          width: '100%',
          textAlign: 'center',
          opacity: enter,
          transform: `translateY(${(1 - enter) * -30}px)`,
          zIndex: 10,
        }}
      >
        <div
          style={{
            fontFamily: theme.fonts.display,
            fontSize: 40,
            fontWeight: 800,
            color: '#FFD11A',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            textShadow: '0 2px 10px rgba(0,0,0,0.8)',
          }}
        >
          OVERALL COMPARISON WINNER
        </div>
        <div
          style={{
            marginTop: 6,
            fontFamily: theme.fonts.display,
            fontSize: 70,
            fontWeight: 900,
            color: '#ffffff',
            textTransform: 'uppercase',
            letterSpacing: '2px',
            textShadow: '0 4px 25px rgba(0,0,0,0.95)',
          }}
        >
          🏆 {winnerPhone.name}
        </div>
      </div>

      {/* Winner Phone Centered - Sized & positioned with ample breathing room so it NEVER covers the header */}
      <div
        style={{
          position: 'absolute',
          left: 960 - 125,
          top: 215,
          zIndex: 15,
        }}
      >
        <PhoneMock
          phone={winnerPhone}
          width={250}
          enterAt={10}
          revealAt={25}
          rank={1}
          phoneCount={1}
        />
      </div>

      {/* Outro Call To Action Footer: Prominent Glowing Pill well above player scrubber bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 95,
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          opacity: enter,
          zIndex: 20,
        }}
      >
        <div
          style={{
            padding: '12px 40px',
            borderRadius: 36,
            background: 'rgba(14, 15, 12, 0.92)',
            border: '2px solid rgba(255, 209, 26, 0.85)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.85), 0 0 25px rgba(255, 209, 26, 0.45)',
            fontFamily: theme.fonts.display,
            fontSize: 32,
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}
        >
          🔔 SUBSCRIBE FOR MORE REVIEWS & COMPARISONS
        </div>
      </div>
    </AbsoluteFill>
  );
};
