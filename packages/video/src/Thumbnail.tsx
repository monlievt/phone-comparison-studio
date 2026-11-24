import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Background} from './components/Background';
import {PhoneMock} from './components/PhoneMock';
import {VsBadge} from './components/VsBadge';
import {theme} from './theme';
import {VideoProps} from './types';
import {deriveComparisonBadge} from './lib/badge';

// High-contrast 1280x720 YouTube Thumbnail composition for Template V1 Classic
export const Thumbnail: React.FC<VideoProps> = ({comparison}) => {
  const phones = comparison.phones;
  const n = phones.length;

  const phoneWidth = n >= 3 ? 300 : 410;
  const gap = n >= 3 ? 50 : 130;
  const startX = (1280 - (n * phoneWidth + (n - 1) * gap)) / 2;

  // Punchy short title (<= 4 words per spec)
  const headerText = n === 2 ? 'WHO WINS?' : 'WHICH ONE?';
  const badge = deriveComparisonBadge(comparison);

  return (
    <AbsoluteFill style={{background: '#090a0d', overflow: 'hidden'}}>
      <Background accents={phones.map((p) => p.accent)} layout="columns" />

      {/* Big YouTube Click Title & Comparison Angle */}
      <div
        style={{
          position: 'absolute',
          top: 18,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          zIndex: 35,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            padding: '10px 52px',
            borderRadius: 30,
            background: 'linear-gradient(90deg, #ff1a40 0%, #ff5e3a 100%)',
            boxShadow: '0 8px 35px rgba(255, 26, 64, 0.75), 0 2px 8px rgba(0,0,0,0.8)',
            fontFamily: theme.fonts.display,
            fontSize: 82,
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            textShadow: '0 4px 15px rgba(0,0,0,0.7)',
          }}
        >
          {headerText}
        </span>

        {badge && (
          <div
            style={{
              background: '#0e0f0c',
              color: '#ffd11a',
              border: '3px solid #ffd11a',
              boxShadow: '0 6px 25px rgba(0, 0, 0, 0.7), 0 0 20px rgba(255, 209, 26, 0.5)',
              borderRadius: 26,
              padding: '6px 32px',
              fontFamily: theme.fonts.display,
              fontSize: 25,
              fontWeight: 900,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
            }}
          >
            🔥 {badge}
          </div>
        )}
      </div>

      {/* Phones in Row */}
      {phones.map((phone, i) => {
        const x = startX + i * (phoneWidth + gap);
        return (
          <div
            key={phone.id}
            style={{
              position: 'absolute',
              left: x,
              bottom: 25,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <PhoneMock
              phone={phone}
              width={phoneWidth}
              enterAt={0}
              revealAt={0}
              rank={1}
              phoneCount={n}
            />

            {/* Phone Name & Price Pill Tag */}
            <div
              style={{
                marginTop: -45,
                zIndex: 30,
                padding: '10px 28px',
                borderRadius: 20,
                background: 'rgba(11, 13, 19, 0.96)',
                border: `3px solid ${phone.accent}`,
                boxShadow: `0 10px 35px ${phone.accent}88, 0 4px 15px rgba(0,0,0,0.9)`,
                textAlign: 'center',
                minWidth: 240,
              }}
            >
              <div
                style={{
                  fontFamily: theme.fonts.display,
                  fontSize: 34,
                  fontWeight: 900,
                  color: '#ffffff',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                {phone.name}
              </div>
              {phone.priceUSD ? (
                <div
                  style={{
                    fontFamily: theme.fonts.display,
                    fontSize: 22,
                    fontWeight: 900,
                    color: '#ffd11a',
                    marginTop: 2,
                  }}
                >
                  ${phone.priceUSD}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}

      {/* Center VS Badge */}
      {n === 2 && (
        <div style={{position: 'absolute', left: 640 - 55, bottom: 250, zIndex: 20}}>
          <VsBadge x={55} y={55} size={110} delay={0} />
        </div>
      )}
    </AbsoluteFill>
  );
};
