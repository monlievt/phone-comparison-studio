import React from 'react';
import {AbsoluteFill, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Background} from './Background';
import {PhoneMock} from './PhoneMock';
import {VsBadge} from './VsBadge';
import {theme} from '../theme';
import {Comparison} from '../types';
import {formatPriceUSD} from '@phone-studio/core';

export const Intro: React.FC<{comparison: Comparison}> = ({comparison}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const phones = comparison.phones;
  const n = phones.length;

  const titleSpring = spring({frame, fps, config: {damping: 14, stiffness: 100}});

  // Layout sizing
  const phoneWidth = n >= 3 ? 240 : 320;
  const gap = n >= 3 ? 120 : 180;
  const startX = (1920 - (n * phoneWidth + (n - 1) * gap)) / 2;

  const title = comparison.title ?? phones.map((p) => p.name).join('  VS  ');

  return (
    <AbsoluteFill>
      <Background phones={phones} />

      {/* Main Comparison Title Banner */}
      <div
        style={{
          position: 'absolute',
          top: 90,
          width: '100%',
          textAlign: 'center',
          opacity: titleSpring,
          transform: `translateY(${(1 - titleSpring) * -40}px)`,
        }}
      >
        <div
          style={{
            fontFamily: theme.fonts.display,
            fontSize: 64,
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            textShadow: '0 4px 20px rgba(0,0,0,0.6)',
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 8,
            fontFamily: theme.fonts.body,
            fontSize: 22,
            color: 'rgba(255,255,255,0.7)',
            letterSpacing: '1px',
          }}
        >
          HEAD-TO-HEAD SPECIFICATION & PERFORMANCE COMPARISON
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
              bottom: 120,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            {/* Launch price tag above or below phone */}
            <div
              style={{
                marginBottom: 24,
                padding: '8px 20px',
                borderRadius: 20,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.18)',
                fontFamily: theme.fonts.display,
                fontSize: 24,
                fontWeight: 700,
                color: '#ffffff',
              }}
            >
              Launch Price: {phone.priceUSD ? formatPriceUSD(phone.priceUSD) : 'N/A'}
            </div>

            <PhoneMock
              phone={phone}
              width={phoneWidth}
              enterAt={10 + i * 6}
              revealAt={35}
              rank={1}
              phoneCount={n}
            />

            {/* Phone Name Tag */}
            <div
              style={{
                marginTop: 24,
                fontFamily: theme.fonts.display,
                fontSize: 32,
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

      {/* VS Badge between phones (2 phones layout) */}
      {n === 2 && (
        <div style={{position: 'absolute', left: 960 - 55, bottom: 440}}>
          <VsBadge enterAt={25} />
        </div>
      )}
    </AbsoluteFill>
  );
};
