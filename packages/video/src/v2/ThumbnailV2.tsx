import React from 'react';
import {AbsoluteFill} from 'remotion';
import {rgba} from '../lib/color';
import {theme} from '../theme';
import {Comparison} from '../types';
import {PhoneActor, phoneHeight} from './PhoneActor';

// 1280x720 Cinematic YouTube Thumbnail for Template V2
// Features massive, horizontal (zero-tilt) typography centered directly on each phone screen.
export const ThumbnailV2: React.FC<{comparison: Comparison; text?: string}> = ({
  comparison,
  text = 'WHO WINS?',
}) => {
  const W = 1280;
  const H = 720;
  const ps = comparison.phones;
  const n = ps.length;
  const w = n === 2 ? 410 : 340;

  return (
    <AbsoluteFill style={{background: '#07080d', overflow: 'hidden'}}>
      {/* Cinematic Stage Spotlight Behind Each Phone */}
      {ps.map((p, i) => {
        // For 2 phones, spread slightly to 305 and 975 to give ample room for huge badges
        const cx = n === 2 ? (i === 0 ? 305 : 975) : (W / n) * (i + 0.5);
        return (
          <div
            key={`glow-${p.id}`}
            style={{
              position: 'absolute',
              left: cx - 440,
              top: 40,
              width: 880,
              height: 780,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${rgba(p.accent, 0.55)} 0%, ${rgba(p.accent, 0.18)} 45%, transparent 74%)`,
              pointerEvents: 'none',
            }}
          />
        );
      })}

      {/* Stage Floor Horizon Line & Light Wash */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 250,
          background: 'linear-gradient(180deg, transparent 0%, rgba(14, 17, 26, 0.95) 100%)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      />

      {/* TOP HEADER: MASSIVE HEROIC TITLE */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 22,
          textAlign: 'center',
          fontFamily: theme.fonts.display,
          fontWeight: 900,
          fontSize: 120,
          lineHeight: 1,
          color: '#ffffff',
          textTransform: 'uppercase',
          letterSpacing: '5px',
          textShadow: '0 8px 40px rgba(0,0,0,0.98), 0 3px 8px rgba(0,0,0,0.9)',
          zIndex: 30,
        }}
      >
        {text}
      </div>

      {/* PHONE ACTORS & MASSIVE HORIZONTAL LABELS */}
      {ps.map((p, i) => {
        const cx = n === 2 ? (i === 0 ? 305 : 975) : (W / n) * (i + 0.5);
        const h = phoneHeight(p, w);
        const rot = n === 2 ? (i === 0 ? -4 : 4) : (i - (n - 1) / 2) * 4;
        const phoneTop = n === 2 ? 150 : 130;
        const bannerTop = 440;

        return (
          <React.Fragment key={p.id}>
            {/* Phone Body with Perspective Tilt - Balanced Cinematic Size */}
            <PhoneActor
              phone={p}
              pose={{
                cx,
                top: phoneTop,
                w,
                rot,
                op: 1,
                glow: 0.95,
              }}
              scale={1.0}
              chipSize={52}
            />

            {/* MASSIVE COMPLETELY HORIZONTAL (ZERO-TILT) BANNER CENTERED ON THE PHONE */}
            <div
              style={{
                position: 'absolute',
                left: cx - 240,
                top: bannerTop,
                width: 480,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 40,
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  background: 'rgba(8, 10, 16, 0.38)',
                  border: `4px solid ${p.accent}`,
                  boxShadow: `0 18px 45px ${rgba(p.accent, 0.70)}, 0 0 30px ${rgba(p.accent, 0.40)}, 0 4px 20px rgba(0,0,0,0.60)`,
                  borderRadius: 24,
                  padding: '16px 36px',
                  textAlign: 'center',
                  minWidth: 360,
                  maxWidth: 470,
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                }}
              >
                {/* Massive Phone Name */}
                <div
                  style={{
                    fontFamily: theme.fonts.display,
                    fontWeight: 900,
                    fontSize: 66,
                    color: '#ffffff',
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                    textShadow: '0 4px 15px rgba(0,0,0,0.98)',
                  }}
                >
                  {p.name}
                </div>

                {/* Massive Bold Price */}
                {p.priceUSD ? (
                  <div
                    style={{
                      fontFamily: theme.fonts.display,
                      fontWeight: 900,
                      fontSize: 64,
                      color: '#ffd11a',
                      marginTop: 4,
                      letterSpacing: '2.5px',
                      lineHeight: 1,
                      textShadow: '0 0 30px rgba(255, 209, 26, 0.9), 0 3px 10px rgba(0,0,0,0.98)',
                    }}
                  >
                    ${p.priceUSD}
                  </div>
                ) : null}
              </div>
            </div>
          </React.Fragment>
        );
      })}

      {/* HIGH-IMPACT BATTLE VS EMBLEM IN CENTER (LEVEL) */}
      {ps.slice(1).map((p, i) => (
        <div
          key={`vs-${p.id}`}
          style={{
            position: 'absolute',
            left: 640 - 65,
            top: H * 0.52 - 32,
            width: 130,
            height: 130,
            borderRadius: '50%',
            background: '#0d0f16',
            color: '#ffffff',
            fontFamily: theme.fonts.display,
            fontWeight: 900,
            fontSize: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '6px solid #ffffff',
            boxShadow: `0 0 0 5px #ffd11a, 0 0 45px rgba(255, 209, 26, 0.75), 0 20px 50px rgba(0,0,0,0.98)`,
            zIndex: 50,
          }}
        >
          VS
        </div>
      ))}
    </AbsoluteFill>
  );
};
