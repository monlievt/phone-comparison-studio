import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Sfx} from '../../components/Sfx';
import {VsBadge} from '../../components/VsBadge';
import {fit} from '../../lib/fit';
import {rgba} from '../../lib/color';
import {theme} from '../../theme';
import {enterP, easeOut} from '../motion';
import {computeOverall} from '../overall';
import {phoneHeight} from '../PhoneActor';
import {poseFor, sizeFactors} from '../poses';
import {credit, SectionProps} from './shared';

// Intro (Long) and Hook (Short). Title + launch price chips. VS badge between the phones.
export const IntroContent: React.FC<SectionProps> = ({src, section, L, orient}) => {
  const frame = useCurrentFrame();
  const n = src.phones.length;
  const land = orient === 'land';
  const isHook = section.kind === 'hook';
  const names = src.phones.map((p) => p.name);
  const title = isHook
    ? src.hook ?? (n === 2 ? `${names[0]} or ${names[1]}?` : 'Which one wins?')
    : src.title ?? names.join(' vs ');
  const size = fit(title, isHook ? (land ? 120 : 130) : land ? 128 : 110, L.W * 0.88, 0.47);
  const o = computeOverall(src);
  const sizes = sizeFactors(src.phones.map((p) => p.shape));
  const t = easeOut((frame - 4) / 26);
  const hasPrices = src.phones.every((p) => p.priceUSD != null);
  const illustrated = src.phones.some((p) => !p.image);

  const poses = src.phones.map((_, i) => poseFor(section.kind, {orient, n, i, L, winners: o.winners}));
  const midY = poses[0].top + (phoneHeight(src.phones[0], poses[0].w * sizes[0]) * 0.5);

  return (
    <>
      <div style={{position: 'absolute', top: land ? 38 : 165, left: 0, right: 0, overflow: 'hidden', textAlign: 'center', paddingBottom: size * 0.1}}>
        <div
          data-text-level="1"
          style={{
            transform: `translateY(${(1 - t) * 115}%)`,
            fontFamily: theme.fonts.display,
            fontWeight: 800,
            fontSize: size,
            lineHeight: 1.05,
            textTransform: 'uppercase',
            color: theme.colors.ink,
          }}
        >
          {title}
        </div>
      </div>
      {!isHook && hasPrices
        ? src.phones.map((p, i) => {
            const e = enterP(frame, 40 + i * 6, 24);
            return (
              <div
                key={p.id}
                data-text-level="2"
                style={{
                  position: 'absolute',
                  left: poses[i].cx - 190,
                  width: 380,
                  top: poses[i].top - (land ? 142 : 148) + (1 - e) * 20,
                  textAlign: 'center',
                  opacity: e,
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    padding: land ? '10px 36px' : '12px 38px',
                    borderRadius: 999,
                    background: '#FFFFFF',
                    border: `4px solid ${rgba(p.accent, 0.95)}`,
                    boxShadow: '0 10px 26px rgba(20,23,28,0.14)',
                    fontFamily: theme.fonts.display,
                    fontWeight: 800,
                    fontSize: land ? 68 : 72,
                    lineHeight: 1.05,
                    color: theme.colors.ink,
                  }}
                >
                  ${p.priceUSD}
                </span>
              </div>
            );
          })
        : null}
      {src.phones.slice(1).map((p, i) => {
        const x = (poses[i].cx + poses[i + 1].cx) / 2;
        return <VsBadge key={p.id} x={x} y={midY} size={L.vsSize} delay={isHook ? 12 : 26} />;
      })}
      {!isHook && hasPrices && illustrated ? credit('Launch prices in USD. Phone graphics are illustrations.', L, land ? 1028 : 1540) : null}
      <Sfx name="swoosh" at={0} volume={0.4} />
      {src.phones.map((p, i) => (
        <Sfx key={p.id} name="whoosh" at={4 + i * 5} volume={0.4} />
      ))}
      <Sfx name="pop" at={isHook ? 12 : 26} volume={0.6} />
    </>
  );
};
