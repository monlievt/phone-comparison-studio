import React from 'react';
import {AbsoluteFill, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Background} from './components/Background';
import {CategoryTitle} from './components/CategoryTitle';
import {NameBar} from './components/NameBar';
import {RankBadge} from './components/RankBadge';
import {Sfx} from './components/Sfx';
import {Watermark} from './components/Watermark';
import {benchmarkRanks, benchmarkSubtitle, fmtMain, fmtPart} from './lib/benchmark';
import {rgba} from './lib/color';
import {useEmphasis} from './lib/emphasis';
import {fit} from './lib/fit';
import {BenchmarkPart, BenchmarkProps, BenchmarkScoreSet, Phone} from './types';
import {theme} from './theme';

const BAR_IN = 24; // first bar starts growing
const STAGGER = 8;
const GROW = 40; // frames a bar takes to grow and count up

const useGrow = (i: number): number => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return spring({frame: frame - (BAR_IN + i * STAGGER), fps, durationInFrames: GROW, config: {damping: 200}});
};

type ColProps = {
  phone: Phone;
  s: BenchmarkScoreSet;
  parts: BenchmarkPart[];
  i: number;
  n: number;
  cx: number;
  baseline: number;
  maxH: number;
  barW: number;
  ratio: number;
  rank: number;
  revealAt: number;
  numSize: number;
  subSize: number;
};

// Vertical bar from the baseline, count-up main score on top, breakdown card inside the bar (if any parts).
const Column: React.FC<ColProps> = ({phone, s, parts, i, n, cx, baseline, maxH, barW, ratio, rank, revealAt, numSize, subSize}) => {
  const grow = useGrow(i);
  const emph = useEmphasis(revealAt, rank, n);
  const rowH = subSize * 1.4;
  const cardH = parts.length > 0 ? rowH * parts.length + 28 : 0;
  const fullBar = Math.max(cardH + 40, 160, maxH * ratio); // tiny scores are clamped so the card still fits
  const barH = fullBar * grow;
  const numBlock = numSize * 1.25;
  const total = barH + numBlock;

  return (
    <div
      style={{
        position: 'absolute',
        left: cx - barW / 2,
        top: baseline - total,
        width: barW,
        height: total,
        transform: `scale(${emph.scale})`,
        transformOrigin: '50% 100%',
        opacity: emph.opacity,
      }}
    >
      <div style={{position: 'absolute', right: -14, top: -64}}>
        <RankBadge rank={rank} at={revealAt} size={80} showSecond={n === 3} />
      </div>
      <div
        style={{
          height: numBlock,
          textAlign: 'center',
          fontFamily: theme.fonts.display,
          fontWeight: 800,
          fontSize: fit(fmtMain(s.main), numSize, barW * 1.25),
          lineHeight: `${numBlock}px`,
          color: theme.colors.ink,
        }}
      >
        {fmtMain(s.main * grow)}
      </div>
      <div
        style={{
          position: 'relative',
          height: barH,
          borderRadius: '28px 28px 0 0',
          overflow: 'hidden',
          background: `linear-gradient(180deg, ${phone.accent} 0%, ${rgba(phone.accent, 0.78)} 100%)`,
          boxShadow: `0 0 ${60 * emph.glow}px ${rgba(phone.accent, 0.6 * emph.glow)}`,
        }}
      >
        {parts.length > 0 ? (
          <div
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 16,
              height: cardH,
              boxSizing: 'border-box',
              padding: '14px 20px',
              borderRadius: 20,
              background: 'rgba(255,255,255,0.88)',
              opacity: Math.max(0, (grow - 0.6) / 0.4),
            }}
          >
            {parts.map((part) => (
              <div key={part.key} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: rowH}}>
                <span style={{fontFamily: theme.fonts.text, fontWeight: 700, fontSize: part.label.length > 12 ? subSize * 0.62 : subSize * 0.8, color: theme.colors.inkSoft}}>
                  {part.label}
                </span>
                <span style={{fontFamily: theme.fonts.display, fontWeight: 700, fontSize: subSize, color: theme.colors.ink}}>
                  {fmtPart(s.parts[part.key])}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

type RowProps = {
  phone: Phone;
  s: BenchmarkScoreSet;
  parts: BenchmarkPart[];
  i: number;
  n: number;
  top: number;
  width: number;
  ratio: number;
  rank: number;
  revealAt: number;
};

// Horizontal layout for 3 phones on a vertical (9:16) canvas.
const Row: React.FC<RowProps> = ({phone, s, parts, i, n, top, width, ratio, rank, revealAt}) => {
  const grow = useGrow(i);
  const emph = useEmphasis(revealAt, rank, n);
  const trackW = width - 120;
  return (
    <div style={{position: 'absolute', left: 0, top, width, height: 480, opacity: emph.opacity}}>
      <div
        style={{
          position: 'absolute',
          left: 60,
          top: 40,
          fontFamily: theme.fonts.display,
          fontWeight: 700,
          fontSize: fit(phone.name, 64, width * 0.5),
          color: theme.colors.ink,
        }}
      >
        {phone.name}
      </div>
      <div
        style={{
          position: 'absolute',
          right: 170,
          top: 20,
          fontFamily: theme.fonts.display,
          fontWeight: 800,
          fontSize: 100,
          color: theme.colors.ink,
          transform: `scale(${emph.scale})`,
          transformOrigin: '100% 50%',
        }}
      >
        {fmtMain(s.main * grow)}
      </div>
      <div style={{position: 'absolute', right: 56, top: 26}}>
        <RankBadge rank={rank} at={revealAt} size={84} showSecond />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 60,
          top: 160,
          width: trackW,
          height: 72,
          borderRadius: 36,
          background: 'rgba(20,23,28,0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: trackW * ratio * grow,
            height: '100%',
            borderRadius: 36,
            background: `linear-gradient(90deg, ${rgba(phone.accent, 0.85)}, ${phone.accent})`,
            boxShadow: `0 0 ${50 * emph.glow}px ${rgba(phone.accent, 0.7 * emph.glow)}`,
          }}
        />
      </div>
      {parts.length > 0 ? (
        <div style={{position: 'absolute', left: 60, top: 270, width: trackW, display: 'flex', gap: 14}}>
          {parts.map((part) => (
            <div
              key={part.key}
              style={{
                flex: 1,
                borderRadius: 20,
                background: 'rgba(255,255,255,0.8)',
                padding: '14px 0',
                textAlign: 'center',
                opacity: Math.max(0, (grow - 0.6) / 0.4),
              }}
            >
              <div style={{fontFamily: theme.fonts.text, fontWeight: 700, fontSize: 26, color: theme.colors.inkSoft}}>{part.label}</div>
              <div style={{fontFamily: theme.fonts.display, fontWeight: 700, fontSize: 54, color: theme.colors.ink}}>
                {fmtPart(s.parts[part.key])}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

// One benchmark as a segment: animated bars (or rows), main score count-up, optional breakdown.
export const BenchmarkSegment: React.FC<BenchmarkProps> = ({comparison, benchmarkIndex}) => {
  const {width, height} = useVideoConfig();
  const {phones} = comparison;
  const bench = comparison.benchmarks?.[benchmarkIndex];
  const n = phones.length;
  if (!bench || bench.scores.some((s) => s === null)) return null;

  const scores = bench.scores as BenchmarkScoreSet[];
  const ranks = benchmarkRanks(scores, bench.lowerIsBetter);
  // bars are proportional to the score; when lower is better the best phone still gets the longest bar
  const mains = scores.map((s) => s.main);
  const best = bench.lowerIsBetter ? Math.min(...mains) : Math.max(...mains);
  const ratios = mains.map((m) => (bench.lowerIsBetter ? best / m : m / best));
  const revealAt = BAR_IN + (n - 1) * STAGGER + GROW + 6;
  const vertical = height > width;
  const rows = vertical && n === 3;
  const subtitle = benchmarkSubtitle(bench);

  const sfx = (
    <>
      <Sfx name="swoosh" at={0} volume={0.35} />
      <Sfx name="pop" at={4} volume={0.5} />
      {phones.map((p, i) => (
        <Sfx key={p.id} name="whoosh" at={BAR_IN + i * STAGGER} volume={0.4} />
      ))}
      <Sfx name="ding" at={revealAt} volume={0.7} />
    </>
  );

  const header = (top: number, size: number, sub: number) => (
    <div style={{position: 'absolute', top, left: 0, right: 0}}>
      <CategoryTitle text={bench.title} size={size} maxWidth={width * 0.9} />
      <div
        style={{
          textAlign: 'center',
          marginTop: 8,
          padding: '0 40px',
          fontFamily: theme.fonts.text,
          fontWeight: 700,
          fontSize: fit(subtitle, sub, width * 0.9, 0.56),
          color: theme.colors.inkSoft,
        }}
      >
        {subtitle}
      </div>
    </div>
  );

  if (rows) {
    const top = 380;
    const rowH = (height - top) / n;
    return (
      <AbsoluteFill>
        <Background accents={phones.map((p) => p.accent)} layout="rows" top={top} />
        {header(90, 116, 30)}
        {phones.map((p, i) => (
          <Row
            key={p.id}
            phone={p}
            s={scores[i]}
            parts={bench.parts}
            i={i}
            n={n}
            top={top + i * rowH + 20}
            width={width}
            ratio={ratios[i]}
            rank={ranks[i]}
            revealAt={revealAt}
          />
        ))}
        <Watermark />
        {sfx}
      </AbsoluteFill>
    );
  }

  const nameBar = vertical ? 140 : 120;
  const baseline = height - nameBar;
  const colW = width / n;
  return (
    <AbsoluteFill>
      <Background accents={phones.map((p) => p.accent)} layout="columns" />
      {header(vertical ? 110 : 36, vertical ? 128 : 118, vertical ? 32 : 30)}
      {phones.map((p, i) => (
        <Column
          key={p.id}
          phone={p}
          s={scores[i]}
          parts={bench.parts}
          i={i}
          n={n}
          cx={colW * i + colW / 2}
          baseline={baseline}
          maxH={vertical ? 1150 : 440}
          barW={vertical ? 400 : n === 2 ? 380 : 320}
          ratio={ratios[i]}
          rank={ranks[i]}
          revealAt={revealAt}
          numSize={vertical ? 110 : n === 2 ? 120 : 96}
          subSize={vertical ? 38 : n === 2 ? 36 : 32}
        />
      ))}
      <NameBar phones={phones} barHeight={nameBar} />
      <Watermark />
      {sfx}
    </AbsoluteFill>
  );
};
