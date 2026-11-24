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

  const cardWidth = n >= 3 ? 500 : 700;
  const gap = 80;
  const startX = (1920 - (n * cardWidth + (n - 1) * gap)) / 2;

  return (
    <AbsoluteFill>
      <Background accents={phones.map((p) => p.accent)} layout="columns" />

      {/* Recap Title */}
      <div
        style={{
          position: 'absolute',
          top: 60,
          width: '100%',
          textAlign: 'center',
          opacity: titleSpring,
          transform: `translateY(${(1 - titleSpring) * -30}px)`,
        }}
      >
        <div
          style={{
            fontFamily: theme.fonts.display,
            fontSize: 66,
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            textShadow: '0 4px 25px rgba(0,0,0,0.9)',
          }}
        >
          FINAL SCORE & CATEGORY BREAKDOWN
        </div>
        <div
          style={{
            marginTop: 10,
            fontFamily: theme.fonts.body,
            fontSize: 24,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.85)',
          }}
        >
          Calculated based on verified technical specification category rankings
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
              top: 260,
              width: cardWidth,
              padding: '48px 44px',
              borderRadius: 32,
              boxSizing: 'border-box',
              background: 'rgba(14, 16, 22, 0.92)',
              border: `3px solid ${rank === 1 ? phone.accent : 'rgba(255, 255, 255, 0.18)'}`,
              boxShadow: rank === 1 ? `0 14px 50px ${phone.accent}55, 0 0 35px ${phone.accent}33` : '0 10px 40px rgba(0,0,0,0.6)',
              opacity: cardSpring,
              transform: `scale(${0.9 + cardSpring * 0.1})`,
            }}
          >
            {/* Phone Name & Rank Badge */}
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <div
                style={{
                  fontFamily: theme.fonts.display,
                  fontSize: 48,
                  fontWeight: 900,
                  color: '#ffffff',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                }}
              >
                {phone.name}
              </div>
              <RankBadge rank={rank} at={30 + i * 8} size={58} showSecond={phones.length === 3} />
            </div>

            {/* Total Points Big Display */}
            <div style={{marginTop: 38, textAlign: 'center'}}>
              <div
                style={{
                  fontFamily: theme.fonts.display,
                  fontSize: 104,
                  fontWeight: 900,
                  color: rank === 1 ? '#ffffff' : 'rgba(255,255,255,0.92)',
                  letterSpacing: '2px',
                  textShadow: rank === 1 ? `0 0 40px ${phone.accent}66` : 'none',
                }}
              >
                {overall.points[i]} <span style={{fontSize: 40, fontWeight: 700, color: '#FFD11A'}}>PTS</span>
              </div>
              <div
                style={{
                  fontFamily: theme.fonts.body,
                  fontSize: 22,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.75)',
                  marginTop: -4,
                }}
              >
                Overall Comparison Score
              </div>
            </div>

            {/* Category Wins Pill - High Contrast, Crystal Clear */}
            <div
              style={{
                marginTop: 40,
                padding: '18px 28px',
                borderRadius: 20,
                background: 'rgba(255, 255, 255, 0.10)',
                border: '1.5px solid rgba(255, 255, 255, 0.22)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontFamily: theme.fonts.display,
                fontSize: 28,
                fontWeight: 800,
                color: '#ffffff',
              }}
            >
              <span style={{letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.9)'}}>
                Categories Won:
              </span>
              <span
                style={{
                  color: '#FFD11A',
                  fontSize: 34,
                  fontWeight: 900,
                  letterSpacing: '1px',
                  textShadow: '0 0 15px rgba(255, 209, 26, 0.6)',
                }}
              >
                {winCounts[i]} Categories
              </span>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
