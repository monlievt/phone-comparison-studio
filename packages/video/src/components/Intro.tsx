import React from 'react';
import {AbsoluteFill, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Background} from './Background';
import {PhoneMock} from './PhoneMock';
import {VsBadge} from './VsBadge';
import {theme} from '../theme';
import {Comparison} from '../types';

function formatPriceUSD(priceUSD?: number | null): string {
  if (priceUSD === undefined || priceUSD === null) return 'N/A';
  return `$${Math.round(priceUSD).toLocaleString('en-US')}`;
}

export const Intro: React.FC<{comparison: Comparison}> = ({comparison}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const phones = comparison.phones;
  const n = phones.length;

  const titleSpring = spring({frame, fps, config: {damping: 14, stiffness: 100}});

  // Sizing to guarantee zero overlap and high legibility across all screen zones:
  // Canvas height = 1080
  // Top Banner: top 24px, height ~105px (ends at ~130px)
  // Price Pills: top 150px, height ~38px (ends at ~188px)
  // Phone: top 220px, width 250px (height: 250 * 2.1 = 525px, ends at 745px)
  // Bottom Phone Name Pill: bottom 90px (height ~65px, safely above player scrubber at 0-50px)
  const phoneWidth = n >= 3 ? 210 : 250;
  const gap = n >= 3 ? 80 : 180;
  const startX = (1920 - (n * phoneWidth + (n - 1) * gap)) / 2;

  const title = comparison.title ?? phones.map((p) => p.name).join('  VS  ');
  const battleHook = comparison.hook || 'FLAGSHIP BATTLE · WHO WINS?';

  return (
    <AbsoluteFill>
      <Background accents={phones.map((p) => p.accent)} layout="columns" />

      {/* Main Comparison Title Banner */}
      <div
        style={{
          position: 'absolute',
          top: 24,
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: titleSpring,
          transform: `translateY(${(1 - titleSpring) * -20}px)`,
          zIndex: 10,
        }}
      >
        <div
          style={{
            fontFamily: theme.fonts.display,
            fontSize: 52,
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            textShadow: '0 4px 24px rgba(0,0,0,0.9)',
          }}
        >
          {title}
        </div>
        <div style={{marginTop: 8}}>
          <span
            style={{
              display: 'inline-block',
              padding: '4px 20px',
              borderRadius: 20,
              background: 'rgba(255, 209, 26, 0.18)',
              border: '1.5px solid rgba(255, 209, 26, 0.65)',
              boxShadow: '0 4px 20px rgba(255, 209, 26, 0.3)',
              fontFamily: theme.fonts.display,
              fontSize: 18,
              fontWeight: 800,
              color: '#FFD11A',
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              textShadow: '0 2px 10px rgba(0,0,0,0.8)',
            }}
          >
            ⚡ {battleHook} ⚡
          </span>
        </div>
      </div>

      {/* Phones Row */}
      {phones.map((phone, i) => {
        const x = startX + i * (phoneWidth + gap);
        const enterSpring = spring({frame: frame - (8 + i * 5), fps, config: {damping: 14, stiffness: 110}});

        return (
          <React.Fragment key={phone.id}>
            {/* Launch price tag: cleanly positioned above each phone with dedicated spacing */}
            <div
              style={{
                position: 'absolute',
                left: x - 40,
                top: 152,
                width: phoneWidth + 80,
                textAlign: 'center',
                opacity: enterSpring,
                zIndex: 15,
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  padding: '6px 20px',
                  borderRadius: 24,
                  background: 'rgba(14, 15, 12, 0.90)',
                  border: `2px solid ${phone.accent}`,
                  boxShadow: `0 4px 20px rgba(0,0,0,0.7), 0 0 15px ${phone.accent}44`,
                  fontFamily: theme.fonts.display,
                  fontSize: 22,
                  fontWeight: 800,
                  color: '#ffffff',
                  letterSpacing: '0.5px',
                }}
              >
                Launch Price: <strong style={{color: '#FFD11A'}}>{phone.priceUSD ? formatPriceUSD(phone.priceUSD) : 'N/A'}</strong>
              </span>
            </div>

            {/* Phone Mock */}
            <div
              style={{
                position: 'absolute',
                left: x,
                top: 220,
              }}
            >
              <PhoneMock
                phone={phone}
                width={phoneWidth}
                enterAt={10 + i * 6}
                revealAt={35}
                rank={1}
                phoneCount={n}
              />
            </div>

            {/* Phone Name Tag: Large, bold, contrast pill positioned safely above scrubber */}
            <div
              style={{
                position: 'absolute',
                left: x - 80,
                bottom: 88,
                width: phoneWidth + 160,
                display: 'flex',
                justifyContent: 'center',
                opacity: enterSpring,
                zIndex: 20,
              }}
            >
              <div
                style={{
                  padding: '12px 36px',
                  borderRadius: 28,
                  background: 'rgba(14, 15, 12, 0.92)',
                  border: `2px solid ${phone.accent}`,
                  boxShadow: `0 8px 30px rgba(0,0,0,0.7), 0 0 20px ${phone.accent}44`,
                  fontFamily: theme.fonts.display,
                  fontSize: 38,
                  fontWeight: 900,
                  color: '#ffffff',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  whiteSpace: 'nowrap',
                }}
              >
                {phone.name}
              </div>
            </div>
          </React.Fragment>
        );
      })}

      {/* VS Badge between phones (2 phones layout) */}
      {n === 2 && (
        <div style={{position: 'absolute', left: 960 - 55, top: 460, zIndex: 25}}>
          <VsBadge x={55} y={55} size={110} delay={25} />
        </div>
      )}
    </AbsoluteFill>
  );
};
