import React from 'react';
import {AbsoluteFill, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Background} from './Background';
import {RankBadge} from './RankBadge';
import {theme} from '../theme';
import {Comparison} from '../types';

export const ScoreRecap: React.FC<{comparison: Comparison}> = ({comparison}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const phones = comparison.phones;
  const n = phones.length;

  const titleSpring = spring({frame, fps, config: {damping: 14, stiffness: 100}});

  // Compute category win counts
  const winCounts = new Array(n).fill(0);
  for (const cat of comparison.categories) {
    for (let i = 0; i < n; i++) {
      if (cat.ranking[i] === 1) winCounts[i]++;
    }
  }

  const overall = comparison.overall ?? {
    points: winCounts.map((w) => w * 2),
    ranking: winCounts.map((w, idx, arr) => (w >= Math.max(...arr) ? 1 : 2)),
  };

  const cardWidth = n >= 3 ? 460 : 620;
  const gap = 80;
  const startX = (1920 - (n * cardWidth + (n - 1) * gap)) / 2;

  return (
    <AbsoluteFill>
      <Background phones={phones} />

      {/* Recap Title */}
      <div
        style={{
          position: 'absolute',
          top: 100,
          width: '100%',
          textAlign: 'center',
          opacity: titleSpring,
          transform: `translateY(${(1 - titleSpring) * -30}px)`,
        }}
      >
        <div
          style={{
            fontFamily: theme.fonts.display,
            fontSize: 60,
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}
        >
          FINAL SCORE & CATEGORY BREAKDOWN
        </div>
        <div
          style={{
            marginTop: 8,
            fontFamily: theme.fonts.body,
            fontSize: 22,
            color: 'rgba(255,255,255,0.7)',
          }}
        >
          Calculated based on weighted specification category rankings
        </div>
      </div>

      {/* Score Cards Row */}
      {phones.map((phone, i) => {
        const x = startX + i * (cardWidth + gap);
        const cardSpring = spring({frame: frame - (15 + i * 10), fps, config: {damping: 15, stiffness: 110}});
        const rank = overall.ranking[i];

        return (
          <div
            key={phone.id}
            style={{
              position: 'absolute',
              left: x,
              top: 320,
              width: cardWidth,
              padding: '40px 32px',
              borderRadius: 24,
              boxSizing: 'border-box',
              background: 'rgba(18, 20, 24, 0.85)',
              border: `2px solid ${rank === 1 ? phone.accent : 'rgba(255, 255, 255, 0.1)'}`,
              boxShadow: rank === 1 ? `0 10px 40px ${phone.accent}44` : 'none',
              opacity: cardSpring,
              transform: `scale(${0.9 + cardSpring * 0.1})`,
            }}
          >
            {/* Phone Name & Rank Badge */}
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <div
                style={{
                  fontFamily: theme.fonts.display,
                  fontSize: 38,
                  fontWeight: 800,
                  color: '#ffffff',
                  textTransform: 'uppercase',
                }}
              >
                {phone.name}
              </div>
              <RankBadge rank={rank} enterAt={30 + i * 8} />
            </div>

            {/* Total Points Big Display */}
            <div style={{marginTop: 36, textAlign: 'center'}}>
              <div
                style={{
                  fontFamily: theme.fonts.display,
                  fontSize: 84,
                  fontWeight: 900,
                  color: rank === 1 ? '#ffffff' : 'rgba(255,255,255,0.85)',
                }}
              >
                {overall.points[i]} <span style={{fontSize: 32, fontWeight: 600}}>PTS</span>
              </div>
              <div
                style={{
                  fontFamily: theme.fonts.body,
                  fontSize: 20,
                  color: 'rgba(255,255,255,0.6)',
                  marginTop: -6,
                }}
              >
                Overall Score
              </div>
            </div>

            {/* Category Wins */}
            <div
              style={{
                marginTop: 36,
                padding: '16px 20px',
                borderRadius: 16,
                background: 'rgba(255,255,255,0.06)',
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: theme.fonts.display,
                fontSize: 24,
                fontWeight: 700,
                color: '#ffffff',
              }}
            >
              <span>Categories Won:</span>
              <span style={{color: phone.accent}}>{winCounts[i]} Categories</span>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
