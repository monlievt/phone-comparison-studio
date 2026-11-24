import React from 'react';
import {useCurrentFrame} from 'remotion';
import {RankBadge} from '../../components/RankBadge';
import {Sfx} from '../../components/Sfx';
import {CategoryTitle} from '../../components/CategoryTitle';
import {benchmarkRanks, benchmarkSubtitle, fmtMain} from '../../lib/benchmark';
import {fit} from '../../lib/fit';
import {rgba} from '../../lib/color';
import {theme} from '../../theme';
import {CountUp} from '../CountUp';
import {enterP} from '../motion';
import {colCx, credit, SectionProps} from './shared';

// One benchmark source, bars standing on the phones. Source, version and month are always shown (credit line).
export const BenchmarkContent: React.FC<SectionProps> = ({src, section, L}) => {
  const frame = useCurrentFrame();
  const b = src.benchmarks![section.benchIndex!];
  const scores = b.scores as {main: number; parts: Record<string, number>}[];
  const ranks = benchmarkRanks(scores, b.lowerIsBetter);
  const n = src.phones.length;
  const max = Math.max(...scores.map((s) => s.main));
  const revealAt = 70;
  const barW = Math.min(L.colW * 0.46, 200);
  const fmt = b.id === 'value' ? (v: number) => v.toFixed(1) : fmtMain;

  return (
    <>
      <div data-text-level="1" style={{position: 'absolute', top: L.titleTop, left: 0, right: 0}}>
        <CategoryTitle text={b.title} size={L.titleSize * 0.9} maxWidth={L.W * 0.82} />
      </div>
      {credit(benchmarkSubtitle(b), L, L.creditTop + (L.W > L.H ? 0 : 0))}
      {src.phones.map((p, i) => {
        const grow = enterP(frame, 20 + i * 6, 40);
        const h = Math.max(0.16, scores[i].main / max) * L.barMax * grow;
        const x = colCx(L, i);
        const numSize = fit(fmt(scores[i].main), L.cardBase * 0.82, L.colW * 0.8);
        return (
          <React.Fragment key={p.id}>
            <div
              style={{
                position: 'absolute',
                left: x - barW / 2,
                top: L.zoneBottom - h,
                width: barW,
                height: h,
                borderRadius: '22px 22px 6px 6px',
                background: `linear-gradient(180deg, ${p.accent} 0%, ${rgba(p.accent, 0.7)} 100%)`,
                boxShadow: `0 14px 30px ${rgba(p.accent, 0.35)}`,
              }}
            />
            <div
              data-text-level="2"
              style={{
                position: 'absolute',
                left: x - L.colW / 2,
                width: L.colW,
                top: L.zoneBottom - h - numSize * 1.1,
                textAlign: 'center',
                fontFamily: theme.fonts.display,
                fontWeight: 800,
                fontSize: numSize,
                lineHeight: 1,
                color: theme.colors.ink,
                opacity: Math.min(1, grow * 2),
              }}
            >
              <CountUp to={scores[i].main} start={20 + i * 6} dur={40} format={fmt} />
            </div>
            <div style={{position: 'absolute', left: x + barW / 2 - L.badge * 0.2, top: L.zoneBottom - h - L.badge * 0.45}}>
              <RankBadge rank={ranks[i]} at={revealAt} size={L.badge * 0.85} showSecond={n === 3} />
            </div>
          </React.Fragment>
        );
      })}
      <Sfx name="swoosh" at={0} volume={0.3} />
      {src.phones.map((p, i) => (
        <Sfx key={p.id} name="tick" at={20 + i * 6} volume={0.45} />
      ))}
      <Sfx name="ding" at={revealAt} volume={0.7} />
    </>
  );
};
