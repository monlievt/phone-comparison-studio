import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Sfx} from '../../components/Sfx';
import {fit} from '../../lib/fit';
import {rgba} from '../../lib/color';
import {theme} from '../../theme';
import {CountUp} from '../CountUp';
import {easeIn, easeOut, enterP, hashStr, seeded} from '../motion';
import {computeOverall} from '../overall';
import {phoneHeight} from '../PhoneActor';
import {poseFor, sizeFactors} from '../poses';
import {SectionProps} from './shared';

const REVEAL = 22;

// Overall winner (Long outro, Short winner). The one special moment of the video: flash + particle burst, once.
export const OutroContent: React.FC<SectionProps> = ({src, section, L, orient}) => {
  const frame = useCurrentFrame();
  const n = src.phones.length;
  const land = orient === 'land';
  const o = computeOverall(src);
  const tie = o.winners.length === n;
  const sizes = sizeFactors(src.phones.map((p) => p.shape));
  const wi = o.winners[0];
  const wp = poseFor(section.kind, {orient, n, i: wi, L, winners: o.winners});
  const heroX = tie ? L.W / 2 : wp.cx;
  const heroY = wp.top + phoneHeight(src.phones[wi], wp.w * sizes[wi]) * 0.42;

  const title = tie ? "It's a tie" : 'Winner';
  const size = fit(title, land ? 116 : 132, L.W * 0.8, 0.5);
  const e = enterP(frame, REVEAL - 6, 24);
  const flash = frame < REVEAL ? 0 : 1 - easeIn((frame - REVEAL) / 16);
  const burst = easeOut((frame - REVEAL) / 44);
  const rnd = seeded(hashStr(src.id + 'burst'));
  const accents = o.winners.map((i) => src.phones[i].accent);

  return (
    <>
      <div style={{position: 'absolute', top: land ? 36 : 155, left: 0, right: 0, textAlign: 'center', opacity: e, transform: `scale(${0.9 + 0.1 * e})`}}>
        <div data-text-level="1" style={{fontFamily: theme.fonts.display, fontWeight: 800, fontSize: size, textTransform: 'uppercase', lineHeight: 1, color: theme.colors.ink}}>
          {title}
        </div>
        <div data-text-level="2" style={{marginTop: land ? 14 : 18}}>
          <span
            style={{
              display: 'inline-block',
              padding: land ? '10px 38px' : '12px 42px',
              borderRadius: 999,
              background: theme.colors.ink,
              border: `4px solid ${accents[0]}`,
              boxShadow: `0 10px 28px ${rgba(accents[0], 0.35)}`,
              fontFamily: theme.fonts.display,
              fontWeight: 800,
              fontSize: land ? 54 : 58,
              lineHeight: 1.05,
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
              color: theme.colors.white,
            }}
          >
            {tie ? (
              <>
                <CountUp to={o.points[wi]} start={REVEAL} dur={36} /> points each
              </>
            ) : (
              <>
                <CountUp to={o.points[wi]} start={REVEAL} dur={36} /> points
              </>
            )}
          </span>
        </div>
      </div>
      {frame >= REVEAL ? (
        <AbsoluteFill style={{pointerEvents: 'none'}}>
          <div style={{position: 'absolute', inset: 0, background: `radial-gradient(circle at ${heroX}px ${heroY}px, rgba(255,255,255,${0.85 * flash}) 0%, rgba(255,255,255,0) 55%)`}} />
          {Array.from({length: 36}).map((_, i) => {
            const a = rnd() * Math.PI * 2;
            const d = (160 + rnd() * 360) * burst;
            const s = 12 + rnd() * 14;
            const sz = rnd();
            const life = Math.max(0, 1 - Math.pow(burst, 2.2));
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: heroX + Math.cos(a) * d - s / 2,
                  top: heroY + Math.sin(a) * d + burst * burst * 140 - s / 2,
                  width: s,
                  height: s * (0.5 + sz * 0.8),
                  borderRadius: 4,
                  background: accents[i % accents.length],
                  opacity: life,
                  transform: `rotate(${a * 57 + burst * 220}deg)`,
                }}
              />
            );
          })}
        </AbsoluteFill>
      ) : null}
      <Sfx name="swoosh" at={0} volume={0.35} />
      <Sfx name="ding" at={REVEAL} volume={0.9} />
      <Sfx name="pop" at={REVEAL + 4} volume={0.5} />
    </>
  );
};
