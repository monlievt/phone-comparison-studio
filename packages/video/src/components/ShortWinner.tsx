import React from 'react';
import {AbsoluteFill, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Background} from './Background';
import {PhoneMock} from './PhoneMock';
import {RankBadge} from './RankBadge';
import {theme} from '../theme';
import {Comparison} from '../types';

export const ShortWinner: React.FC<{comparison: Comparison}> = ({comparison}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const phones = comparison.phones;

  const winnerIdx = comparison.overall?.ranking.indexOf(1) ?? 0;
  const winnerPhone = phones[winnerIdx >= 0 ? winnerIdx : 0];

  const enter = spring({frame, fps, config: {damping: 14, stiffness: 110}});

  return (
    <AbsoluteFill>
      <Background phones={phones} />

      {/* Winner Title */}
      <div
        style={{
          position: 'absolute',
          top: 220,
          width: '100%',
          textAlign: 'center',
          opacity: enter,
          transform: `translateY(${(1 - enter) * -40}px)`,
        }}
      >
        <div
          style={{
            fontFamily: theme.fonts.display,
            fontSize: 54,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.7)',
            letterSpacing: '2px',
          }}
        >
          THE WINNER IS
        </div>
        <div
          style={{
            marginTop: 8,
            fontFamily: theme.fonts.display,
            fontSize: 76,
            fontWeight: 900,
            color: '#ffffff',
            textTransform: 'uppercase',
            letterSpacing: '2px',
          }}
        >
          🏆 {winnerPhone.name}
        </div>
      </div>

      {/* Center Winner Phone */}
      <div
        style={{
          position: 'absolute',
          left: 540 - 200,
          bottom: 340,
        }}
      >
        <PhoneMock
          phone={winnerPhone}
          width={400}
          enterAt={5}
          revealAt={20}
          rank={1}
          phoneCount={1}
        />
      </div>

      {/* Rank Badge */}
      <div style={{position: 'absolute', right: 540 - 180, top: 480}}>
        <RankBadge rank={1} enterAt={15} />
      </div>
    </AbsoluteFill>
  );
};
