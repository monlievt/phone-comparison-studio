import React from 'react';
import {useCurrentFrame} from 'remotion';
import {CategoryTitle} from '../../components/CategoryTitle';
import {RankBadge} from '../../components/RankBadge';
import {Sfx} from '../../components/Sfx';
import {StatCard} from '../../components/StatCard';
import {badgeAt, T} from '../../lib/timing';
import {enterP} from '../motion';
import {colCx, SectionProps} from './shared';

// Content only: the phones belong to the Stage. Title + one stat card per phone (max two text levels).
export const CategoryContent: React.FC<SectionProps> = ({src, section, L}) => {
  const frame = useCurrentFrame();
  const cat = src.categories[section.catIndex!];
  const n = src.phones.length;
  const revealAt = badgeAt(n);
  const flip = section.transition === 'flipIn';

  return (
    <>
      <div data-text-level="1" style={{position: 'absolute', top: L.titleTop, left: 0, right: 0}}>
        <CategoryTitle text={cat.label} size={L.titleSize} maxWidth={L.W * 0.82} />
      </div>
      {src.phones.map((p, i) => {
        const delay = T.valueIn + i * T.valueStagger;
        const e = flip ? enterP(frame, delay - 8, 26) : 1;
        const rank = cat.ranking[i];
        return (
          <div
            key={p.id}
            data-text-level="2"
            style={{
              position: 'absolute',
              left: colCx(L, i) - L.cardW / 2,
              top: L.cardTop,
              perspective: 900,
            }}
          >
            <div style={{transform: flip ? `rotateX(${(1 - e) * -78}deg)` : 'none', transformOrigin: '50% 100%'}}>
              <StatCard
                value={cat.values[i]}
                accent={p.accent}
                width={L.cardW}
                height={L.cardH}
                baseSize={L.cardBase}
                delay={delay}
                revealAt={revealAt}
                rank={rank}
                phoneCount={n}
              />
              <div style={{position: 'absolute', right: -L.badge * 0.3, top: -L.badge * 0.3}}>
                <RankBadge rank={rank} at={revealAt} size={L.badge} showSecond={n === 3} />
              </div>
            </div>
          </div>
        );
      })}
      <Sfx name="swoosh" at={0} volume={0.3} />
      {src.phones.map((p, i) => (
        <Sfx key={p.id} name="tick" at={T.valueIn + i * T.valueStagger} volume={0.5} />
      ))}
      <Sfx name="ding" at={revealAt} volume={0.7} />
    </>
  );
};
