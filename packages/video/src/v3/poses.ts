import {PhoneShape} from '../types';
import {Layout} from './layout';
import {lerp} from './motion';
import {Orient, Section} from './types';

export type Pose = {cx: number; top: number; w: number; rot: number; op: number; glow: number};

// Phone body proportions relative to the others in the same video (clamped so odd data never breaks the layout).
export const sizeFactors = (shapes: (PhoneShape | undefined)[]): number[] => {
  const widths = shapes.map((s) => s?.bodyMM?.w ?? null);
  if (widths.some((w) => w == null)) return shapes.map(() => 1);
  const avg = (widths as number[]).reduce((a, b) => a + b, 0) / widths.length;
  return (widths as number[]).map((w) => Math.min(1.12, Math.max(0.88, w / avg)));
};

type Ctx = {orient: Orient; n: number; i: number; L: Layout; winners: number[]};

// Where phone i stands in a given kind of section. The stage morphs between these poses.
export const poseFor = (kind: Section['kind'], {orient, n, i, L, winners}: Ctx): Pose => {
  const land = orient === 'land';
  const colCx = L.colW * (i + 0.5);
  const close = (k: number) => L.W / 2 + (colCx - L.W / 2) * k; // pull columns toward the center
  const isWinner = winners.includes(i);
  const tie = winners.length === n;

  switch (kind) {
    case 'intro':
    case 'hook': {
      const w = land ? (n === 2 ? 230 : 200) : n === 2 ? 310 : 250;
      const rot = (i - (n - 1) / 2) * (land ? 4.5 : 4);
      return {cx: close(land ? 0.78 : 0.8), top: land ? 300 : 580, w, rot, op: 1, glow: 0.5};
    }
    case 'category':
    case 'benchmark': {
      const w = land ? (n === 2 ? 194 : 174) : n === 2 ? 305 : 240;
      return {cx: colCx, top: land ? 374 : 640, w, rot: 0, op: 1, glow: 0.35};
    }
    case 'recap': {
      const w = land ? 172 : n === 2 ? 260 : 210;
      return {cx: colCx, top: land ? 475 : 960, w, rot: 0, op: 1, glow: 0.35};
    }
    case 'outro':
    case 'winner': {
      if (tie) {
        const w = land ? (n === 2 ? 235 : 205) : n === 2 ? 300 : 240;
        return {cx: close(0.85), top: land ? 320 : 720, w, rot: 0, op: 1, glow: 0.8};
      }
      if (isWinner) return {cx: L.W / 2, top: land ? 315 : 490, w: land ? 235 : 355, rot: 0, op: 1, glow: 1};
      const others = [...Array(n).keys()].filter((k) => !winners.includes(k));
      const slot = others.indexOf(i);
      const dir = others.length === 1 ? (i < winners[0] ? -1 : 1) : slot === 0 ? -1 : 1;
      const off = land ? 560 : 350;
      return {cx: L.W / 2 + dir * off, top: land ? 495 : 840, w: land ? 165 : 190, rot: dir * 4, op: 0.55, glow: 0.15};
    }
  }
};

export const mixPose = (a: Pose, b: Pose, t: number): Pose => ({
  cx: lerp(a.cx, b.cx, t),
  top: lerp(a.top, b.top, t),
  w: lerp(a.w, b.w, t),
  rot: lerp(a.rot, b.rot, t),
  op: lerp(a.op, b.op, t),
  glow: lerp(a.glow, b.glow, t),
});

export type Cam = {s0: number; s1: number; x0: number; x1: number; y0: number; y1: number};

// Camera move over one section: slow push, pull or pan. Always small (no edge reveal: the background is oversized).
export const cameraFor = (s: Section, k: number): Cam => {
  switch (s.kind) {
    case 'intro':
    case 'hook':
      return {s0: 1.0, s1: 1.04, x0: 0, x1: 0, y0: 0, y1: -4};
    case 'category': {
      const v = k % 3;
      if (v === 0) return {s0: 1.0, s1: 1.05, x0: 0, x1: 0, y0: 0, y1: -14};
      if (v === 1) return {s0: 1.04, s1: 1.0, x0: 20, x1: -20, y0: -8, y1: 0};
      return {s0: 1.02, s1: 1.05, x0: -22, x1: 22, y0: 0, y1: -10};
    }
    case 'benchmark':
      return {s0: 1.0, s1: 1.04, x0: 0, x1: 0, y0: 0, y1: -10};
    case 'recap':
      return {s0: 1.04, s1: 1.0, x0: 0, x1: 0, y0: -10, y1: 0};
    default:
      return {s0: 1.0, s1: 1.05, x0: 0, x1: 0, y0: 0, y1: -8};
  }
};
