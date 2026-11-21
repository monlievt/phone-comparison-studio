import React from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import {Background} from './components/Background';
import {CategoryTitle} from './components/CategoryTitle';
import {PhoneMock, PHONE_RATIO} from './components/PhoneMock';
import {RankBadge} from './components/RankBadge';
import {Sfx} from './components/Sfx';
import {StatCard} from './components/StatCard';
import {VsBadge} from './components/VsBadge';
import {Watermark} from './components/Watermark';
import {fit} from './lib/fit';
import {badgeAt, T} from './lib/timing';
import {SegmentProps} from './types';
import {theme} from './theme';

// 9:16 segment. 2 phones: split columns. 3 phones: stacked rows (a third column would be too narrow).
export const CategoryVertical: React.FC<SegmentProps> = ({comparison, categoryIndex}) => {
  const {width, height} = useVideoConfig();
  const {phones} = comparison;
  const cat = comparison.categories[categoryIndex];
  const n = phones.length;
  const revealAt = badgeAt(n);
  const rows = n === 3;

  const sfx = (
    <>
      <Sfx name="swoosh" at={0} volume={0.35} />
      <Sfx name="pop" at={4} volume={0.5} />
      {phones.map((p, i) => (
        <React.Fragment key={p.id}>
          <Sfx name="whoosh" at={T.phoneIn + i * T.phoneStagger} volume={0.4} />
          <Sfx name="tick" at={T.valueIn + i * T.valueStagger} volume={0.5} />
        </React.Fragment>
      ))}
      <Sfx name="ding" at={revealAt} volume={0.7} />
    </>
  );

  if (!rows) {
    const colW = width / n;
    const cardW = colW * 0.86;
    const phoneW = 440;
    return (
      <AbsoluteFill style={{fontFamily: theme.fonts.text}}>
        <Background accents={phones.map((p) => p.accent)} layout="columns" />
        <div style={{position: 'absolute', top: 110, left: 0, right: 0}}>
          <CategoryTitle text={cat.label} size={128} maxWidth={width * 0.9} />
        </div>
        {phones.map((p, i) => {
          const cx = colW * i + colW / 2;
          const rank = cat.ranking[i];
          return (
            <React.Fragment key={p.id}>
              <div style={{position: 'absolute', left: cx - cardW / 2, top: 340}}>
                <StatCard
                  value={cat.values[i]}
                  accent={p.accent}
                  width={cardW}
                  height={250}
                  baseSize={84}
                  delay={T.valueIn + i * T.valueStagger}
                  revealAt={revealAt}
                  rank={rank}
                  phoneCount={n}
                />
                <div style={{position: 'absolute', right: -22, top: -22}}>
                  <RankBadge rank={rank} at={revealAt} size={92} showSecond={false} />
                </div>
              </div>
              <div
                style={{
                  position: 'absolute',
                  top: 620,
                  left: cx - colW / 2,
                  width: colW,
                  textAlign: 'center',
                  fontFamily: theme.fonts.display,
                  fontWeight: 700,
                  fontSize: fit(p.name, 60, colW * 0.9),
                  color: theme.colors.ink,
                }}
              >
                {p.name}
              </div>
              <div style={{position: 'absolute', left: cx - phoneW / 2, top: 760}}>
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
        <VsBadge x={width / 2} y={1100} size={110} />
        <Watermark />
        {sfx}
      </AbsoluteFill>
    );
  }

  const top = 300;
  const rowH = (height - top) / n;
  const phoneW = 210;
  const phoneH = phoneW * PHONE_RATIO;
  const cardW = 680;
  return (
    <AbsoluteFill style={{fontFamily: theme.fonts.text}}>
      <Background accents={phones.map((p) => p.accent)} layout="rows" top={top} />
      <div style={{position: 'absolute', top: 90, left: 0, right: 0}}>
        <CategoryTitle text={cat.label} size={116} maxWidth={width * 0.9} />
      </div>
      {phones.map((p, i) => {
        const rowTop = top + i * rowH;
        const rank = cat.ranking[i];
        return (
          <React.Fragment key={p.id}>
            <div style={{position: 'absolute', left: 60, top: rowTop + (rowH - phoneH) / 2}}>
              <PhoneMock
                phone={p}
                width={phoneW}
                enterAt={T.phoneIn + i * T.phoneStagger}
                revealAt={revealAt}
                rank={rank}
                phoneCount={n}
              />
            </div>
            <div
              style={{
                position: 'absolute',
                left: 340,
                top: rowTop + 60,
                width: cardW,
                fontFamily: theme.fonts.display,
                fontWeight: 700,
                fontSize: fit(p.name, 64, cardW),
                color: theme.colors.ink,
              }}
            >
              {p.name}
            </div>
            <div style={{position: 'absolute', left: 340, top: rowTop + 160}}>
              <StatCard
                value={cat.values[i]}
                accent={p.accent}
                width={cardW}
                height={240}
                baseSize={92}
                delay={T.valueIn + i * T.valueStagger}
                revealAt={revealAt}
                rank={rank}
                phoneCount={n}
              />
              <div style={{position: 'absolute', right: -18, top: -22}}>
                <RankBadge rank={rank} at={revealAt} size={88} showSecond />
              </div>
            </div>
          </React.Fragment>
        );
      })}
      {phones.slice(1).map((p, i) => (
        <VsBadge key={p.id} x={165} y={top + rowH * (i + 1)} size={90} />
      ))}
      <Watermark />
      {sfx}
    </AbsoluteFill>
  );
};
