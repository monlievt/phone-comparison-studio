import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {BackgroundV3} from './BackgroundV3';
import {layout} from './layout';
import {clamp01, easeInOut, easeOut, lerp, MORPH} from './motion';
import {computeOverall, sectionRanks} from './overall';
import {PhoneActor, phoneHeight} from './PhoneActor';
import {cameraFor, mixPose, Pose, poseFor, sizeFactors} from './poses';
import {Orient, Plan} from './types';
import {badgeAt} from '../lib/timing';

const REVEAL_BENCH = 70; // frames after the benchmark section starts

// Per-phone emphasis after the reveal: winners grow and glow, the others dim. Returns neutral for sections without a reveal.
const emphasisTarget = (rank: number | undefined, n: number, r: number) => {
  if (rank == null) return {scale: 1, op: 1};
  const winner = rank === 1;
  const dimTo = winner ? 1 : n === 3 && rank === 2 ? 0.8 : 0.55;
  return {scale: 1 + (winner ? 0.05 : -0.03) * r, op: 1 + (dimTo - 1) * r};
};

// Persistent world: background, camera and phones live outside the segments, so segments swap content, not scenes.
export const Stage: React.FC<{plan: Plan; orient: Orient}> = ({plan, orient}) => {
  const frame = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const {src, sections} = plan;
  const n = src.phones.length;
  const L = layout(orient, n);
  const overall = computeOverall(src);
  const sizes = sizeFactors(src.phones.map((p) => p.shape));

  let k = 0;
  sections.forEach((s, idx) => {
    if (s.start <= frame) k = idx;
  });
  const cur = sections[k];
  const prev = k > 0 ? sections[k - 1] : null;
  const local = frame - cur.start;

  const emph = (sec: typeof cur, f: number) => {
    const ranks = sectionRanks(src, sec);
    const revealAt = sec.kind === 'category' ? badgeAt(n) : sec.kind === 'benchmark' ? REVEAL_BENCH : Infinity;
    const r = clamp01((f - revealAt) / 16);
    return src.phones.map((_, i) => emphasisTarget(ranks?.[i], n, ranks ? easeOut(r) : 0));
  };

  const prevFinal = prev ? emph(prev, prev.dur) : null;
  const curNow = emph(cur, local);

  const poses: Pose[] = src.phones.map((_, i) => {
    const ctx = {orient, n, i, L, winners: overall.winners};
    const target = poseFor(cur.kind, ctx);
    let pose = target;
    if (prev) {
      const t = easeInOut((local - i * 3) / MORPH);
      pose = mixPose(poseFor(prev.kind, ctx), target, t);
    } else {
      const t = easeOut((frame - 4 - i * 5) / 30); // first section: phones rise in
      pose = {...target, top: target.top + (1 - t) * 260, op: target.op * Math.min(1, t * 1.8)};
    }
    const w = easeInOut(local / MORPH);
    const e0 = prevFinal ? prevFinal[i] : {scale: 1, op: 1};
    const e1 = curNow[i];
    const scale = lerp(e0.scale, e1.scale, prev ? w : 1);
    const op = lerp(e0.op, e1.op, prev ? w : 1);
    const float = Math.sin(frame / 30 * 2 * Math.PI / 3.4 + i) * 5;
    return {...pose, w: pose.w * sizes[i] * scale, top: pose.top + float, op: pose.op * op};
  });

  // Camera: slow move per section, blended from the previous section's end, plus a small breathing drift.
  const camNow = (sec: typeof cur, f: number) => {
    const c = cameraFor(sec, sections.indexOf(sec));
    const p = easeInOut(f / sec.dur);
    return {s: lerp(c.s0, c.s1, p), x: lerp(c.x0, c.x1, p), y: lerp(c.y0, c.y1, p)};
  };
  const c1 = camNow(cur, local);
  const c0 = prev ? camNow(prev, prev.dur) : c1;
  const cw = prev ? easeInOut(local / MORPH) : 1;
  const cam = {s: lerp(c0.s, c1.s, cw), x: lerp(c0.x, c1.x, cw), y: lerp(c0.y, c1.y, cw)};
  const breath = {s: 0.012 * Math.sin(frame / 45), x: 6 * Math.sin(frame / 70), y: 5 * Math.cos(frame / 55)};

  const glows = poses.map((p, i) => {
    const h = phoneHeight(src.phones[i], p.w);
    return {x: p.cx, y: p.top + h * 0.55, size: Math.max(p.w * 2.6, L.colW * 0.9)};
  });
  const ox = W * 0.09; // oversized background: camera moves never reveal an edge
  const oy = H * 0.09;

  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      <AbsoluteFill style={{transform: `translate(${cam.x + breath.x}px, ${cam.y + breath.y}px) scale(${cam.s + breath.s})`, transformOrigin: '50% 55%'}}>
        <div style={{position: 'absolute', left: -ox, top: -oy, width: W + 2 * ox, height: H + 2 * oy}}>
          <BackgroundV3
            accents={src.phones.map((p) => p.accent)}
            glows={glows.map((g) => ({...g, x: g.x + ox, y: g.y + oy}))}
            preset={plan.motionPreset}
            W={W + 2 * ox}
            H={H + 2 * oy}
          />
        </div>
        {src.phones.map((p, i) => {
          const isOutroRunnerUp = (cur.kind === 'outro' || cur.kind === 'winner') && !overall.winners.includes(i);
          const maxChipWidth = isOutroRunnerUp ? (orient === 'land' ? 540 : 370) : L.colW * 0.92;
          return <PhoneActor key={p.id} phone={p} pose={poses[i]} chipSize={L.chipSize} maxChipWidth={maxChipWidth} />;
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
