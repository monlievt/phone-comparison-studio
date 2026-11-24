import React from 'react';
import {useCurrentFrame} from 'remotion';
import {CategoryTitle} from '../../components/CategoryTitle';
import {RankBadge} from '../../components/RankBadge';
import {Sfx} from '../../components/Sfx';
import {fit} from '../../lib/fit';
import {rgba} from '../../lib/color';
import {theme} from '../../theme';
import {CountUp} from '../CountUp';
import {enterP} from '../motion';
import {computeOverall} from '../overall';
import {colCx, SectionProps} from './shared';

export const RecapContent: React.FC<SectionProps> = ({src, L, orient}) => {
  const frame = useCurrentFrame();
  const o = computeOverall(src);
  const n = src.phones.length;
  const land = orient === 'land';
  const cardW = L.cardW * (land ? 0.95 : 0.9);
  const cardH = land ? 250 : 270;
  const top = land ? 190 : 380;
  const revealAt = 100;

  return (
    <>
      <div data-text-level="1" style={{position: 'absolute', top: L.titleTop, left: 0, right: 0}}>
        <CategoryTitle text="Final score" size={L.titleSize} maxWidth={L.W * 0.8} />
      </div>
      {src.phones.map((p, i) => {
        const e = enterP(frame, 22 + i * 8, 26);
        const pts = fit(String(Math.round(o.points[i])), land ? 130 : 110, cardW * 0.8, 0.55);
        return (
          <div
            key={p.id}
            data-text-level="2"
            style={{
              position: 'absolute',
              left: colCx(L, i) - cardW / 2,
              top: top + (1 - e) * 60,
              width: cardW,
              height: cardH,
              boxSizing: 'border-box',
              borderRadius: 30,
              background: 'rgba(255,255,255,0.82)',
              border: `${o.ranking[i] === 1 ? 5 : 3}px solid ${o.ranking[i] === 1 ? p.accent : 'rgba(20,23,28,0.08)'}`,
              boxShadow: `0 18px 40px rgba(20,23,28,0.12), 0 0 ${o.ranking[i] === 1 ? 60 : 0}px ${rgba(p.accent, 0.4)}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: e,
            }}
          >
            <div style={{fontFamily: theme.fonts.display, fontWeight: 800, fontSize: pts, lineHeight: 1, color: theme.colors.ink}}>
              <CountUp to={o.points[i]} start={28 + i * 8} dur={44} />
            </div>
            <div style={{fontFamily: theme.fonts.text, fontWeight: 700, fontSize: cardH * 0.13, color: theme.colors.inkSoft}}>
              {o.wins[i]} category {o.wins[i] === 1 ? 'win' : 'wins'}
            </div>
            <div style={{position: 'absolute', right: -L.badge * 0.3, top: -L.badge * 0.3}}>
              <RankBadge rank={o.ranking[i]} at={revealAt} size={L.badge} showSecond={n === 3} />
            </div>
          </div>
        );
      })}
      <Sfx name="swoosh" at={0} volume={0.3} />
      {src.phones.map((p, i) => (
        <Sfx key={p.id} name="tick" at={28 + i * 8} volume={0.5} />
      ))}
      <Sfx name="ding" at={revealAt} volume={0.8} />
    </>
  );
};
