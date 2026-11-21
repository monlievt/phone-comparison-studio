import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Background} from './components/Background';
import {PhoneMock} from './components/PhoneMock';
import {VsBadge} from './components/VsBadge';
import {theme} from './theme';
import {VideoProps} from './types';

// High-contrast 1280x720 YouTube Thumbnail composition
export const Thumbnail: React.FC<VideoProps> = ({comparison}) => {
  const phones = comparison.phones;
  const n = phones.length;

  const phoneWidth = n >= 3 ? 280 : 380;
  const gap = n >= 3 ? 60 : 160;
  const startX = (1280 - (n * phoneWidth + (n - 1) * gap)) / 2;

  // Punchy short title (<= 4 words per spec)
  const headerText = n === 2 ? 'WHO WINS?' : 'WHICH ONE?';

  return (
    <AbsoluteFill style={{background: '#090a0d', overflow: 'hidden'}}>
      <Background phones={phones} />

      {/* Big YouTube Click Title */}
      <div
        style={{
          position: 'absolute',
          top: 36,
          width: '100%',
          textAlign: 'center',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            padding: '10px 48px',
            borderRadius: 24,
            background: 'linear-gradient(90deg, #ff1a40 0%, #ff5e3a 100%)',
            boxShadow: '0 8px 30px rgba(255, 26, 64, 0.6)',
            fontFamily: theme.fonts.display,
            fontSize: 64,
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            textShadow: '0 3px 12px rgba(0,0,0,0.5)',
          }}
        >
          {headerText}
        </span>
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
              bottom: 40,
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

            {/* Phone Name Pill Tag */}
            <div
              style={{
                marginTop: -40,
                zIndex: 10,
                padding: '8px 24px',
                borderRadius: 16,
                background: 'rgba(15, 17, 21, 0.95)',
                border: `2px solid ${phone.accent}`,
                boxShadow: `0 6px 20px ${phone.accent}66`,
                fontFamily: theme.fonts.display,
                fontSize: 28,
                fontWeight: 800,
                color: '#ffffff',
                textTransform: 'uppercase',
              }}
            >
              {phone.name}
            </div>
          </div>
        );
      })}

      {/* Center VS Badge */}
      {n === 2 && (
        <div style={{position: 'absolute', left: 640 - 55, bottom: 250, zIndex: 20}}>
          <VsBadge enterAt={0} />
        </div>
      )}
    </AbsoluteFill>
  );
};
