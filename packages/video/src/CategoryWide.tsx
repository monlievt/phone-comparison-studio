import React from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import {Background} from './components/Background';
import {CategoryTitle} from './components/CategoryTitle';
import {NameBar} from './components/NameBar';
import {PhoneMock} from './components/PhoneMock';
import {RankBadge} from './components/RankBadge';
import {Sfx} from './components/Sfx';
import {StatCard} from './components/StatCard';
import {VsBadge} from './components/VsBadge';
import {Watermark} from './components/Watermark';
import {badgeAt, T} from './lib/timing';
import {SegmentProps} from './types';
import {theme} from './theme';

const BAR = 150;

// 16:9 segment: title on top, one column per phone (value card above, phone rising from the name bar).
export const CategoryWide: React.FC<SegmentProps> = ({comparison, categoryIndex}) => {
  const {width} = useVideoConfig();
  const {phones} = comparison;
  const cat = comparison.categories[categoryIndex];
  const n = phones.length;

  const colW = width / n;
  const cardW = colW * (n === 2 ? 0.62 : 0.7);
  const cardH = 210;
  const phoneW = n === 2 ? 280 : 240;
  const baseSize = n === 2 ? 112 : 88;
  const revealAt = badgeAt(n);

  return (
    <AbsoluteFill style={{fontFamily: theme.fonts.text}}>
      <Background accents={phones.map((p) => p.accent)} layout="columns" />

      <div style={{position: 'absolute', top: 36, left: 0, right: 0}}>
        <CategoryTitle text={cat.label} size={118} maxWidth={width * 0.8} />
      </div>

      {phones.map((p, i) => {
        const cx = colW * i + colW / 2;
        const rank = cat.ranking[i];
        return (
          <React.Fragment key={p.id}>
            <div style={{position: 'absolute', left: cx - cardW / 2, top: 230}}>
              <StatCard
                value={cat.values[i]}
                accent={p.accent}
                width={cardW}
                height={cardH}
                baseSize={baseSize}
                delay={T.valueIn + i * T.valueStagger}
                revealAt={revealAt}
                rank={rank}
                phoneCount={n}
              />
              <div style={{position: 'absolute', right: -26, top: -26}}>
                <RankBadge rank={rank} at={revealAt} size={84} showSecond={n === 3} />
              </div>
            </div>
            <div style={{position: 'absolute', left: cx - phoneW / 2, top: 490}}>
              <PhoneMock
                phone={p}
                width={phoneW}
                enterAt={T.phoneIn + i * T.phoneStagger}
                revealAt={revealAt}
                rank={rank}
                phoneCount={n}
              />
            </div>
          </React.Fragment>
        );
      })}

      {phones.slice(1).map((p, i) => (
        <VsBadge key={p.id} x={colW * (i + 1)} y={700} size={110} />
      ))}

      <NameBar phones={phones} barHeight={BAR} />
      <Watermark />

      <Sfx name="swoosh" at={0} volume={0.35} />
      <Sfx name="pop" at={4} volume={0.5} />
      {phones.map((p, i) => (
        <React.Fragment key={p.id}>
          <Sfx name="whoosh" at={T.phoneIn + i * T.phoneStagger} volume={0.4} />
          <Sfx name="tick" at={T.valueIn + i * T.valueStagger} volume={0.5} />
        </React.Fragment>
      ))}
      <Sfx name="ding" at={revealAt} volume={0.7} />
    </AbsoluteFill>
  );
};
