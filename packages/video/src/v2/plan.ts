import {completeBenchmarkIndexes} from '../lib/benchmark';
import {pickShortCategories} from '../lib/rank';
import {categoryFrames} from '../lib/timing';
import {Comparison} from '../types';
import {hashStr, OVERLAP} from './motion';
import {Format, MOTION_PRESETS, MotionPreset, Plan, Section, SectionKind, TransitionKind} from './types';

export const SECONDS = {intro: 5, hook: 2, benchmark: 8, recap: 8, outro: 6, winner: 3} as const;
const f = (s: number): number => Math.round(s * 30);

// Deterministic rotation of enter transitions. Plain wipes (band) are capped, at least one depth transition is used.
const CYCLE: TransitionKind[] = ['flipIn', 'circle', 'slide', 'flipIn', 'band', 'circle', 'slide', 'flipIn', 'band', 'circle'];

export const buildPlan = (c: Comparison, format: Format, seed?: string, preset?: MotionPreset): Plan => {
  const src = format === 'short' ? pickShortCategories(c) : c;
  const n = src.phones.length;
  const s = seed ?? c.id;
  const h = hashStr(s);

  const items: {kind: SectionKind; dur: number; catIndex?: number; benchIndex?: number}[] = [];
  items.push(format === 'long' ? {kind: 'intro', dur: f(SECONDS.intro)} : {kind: 'hook', dur: f(SECONDS.hook)});
  src.categories.forEach((cat, i) => items.push({kind: 'category', dur: categoryFrames(cat, n), catIndex: i}));
  completeBenchmarkIndexes(src).forEach((bi) => items.push({kind: 'benchmark', dur: f(SECONDS.benchmark), benchIndex: bi}));
  if (format === 'long') items.push({kind: 'recap', dur: f(SECONDS.recap)});
  items.push(format === 'long' ? {kind: 'outro', dur: f(SECONDS.outro)} : {kind: 'winner', dur: f(SECONDS.winner)});

  let bands = 0;
  let cursor = 0;
  const sections: Section[] = items.map((it, k) => {
    let transition: TransitionKind = 'slide';
    if (k > 0) {
      if (it.kind === 'outro' || it.kind === 'winner') transition = 'circle'; // the one special moment
      else {
        transition = CYCLE[(h + k) % CYCLE.length];
        if (transition === 'band' && bands >= 2) transition = 'flipIn';
      }
      if (transition === 'band') bands += 1;
    }
    const start = cursor;
    cursor += it.dur - OVERLAP;
    return {...it, start, transition};
  });
  const last = sections[sections.length - 1];
  const total = last.start + last.dur;
  const motionPreset = preset ?? MOTION_PRESETS[h % MOTION_PRESETS.length];
  const fingerprint = [motionPreset, sections.map((x) => x.transition[0]).join('')].join(':');
  return {sections, total, src, format, motionPreset, fingerprint};
};

// Mechanical style checks (MOTION_STYLE.md section 5). Returns the problems found.
export const checkPlan = (plan: Plan): string[] => {
  const issues: string[] = [];
  const t = plan.sections.slice(1).map((x) => x.transition);
  if (t.length >= 3) {
    if (new Set(t).size < 2) issues.push('needs at least 2 different transition kinds');
    if (!t.some((x) => x === 'flipIn' || x === 'circle')) issues.push('needs at least one depth transition');
  }
  if (t.filter((x) => x === 'band').length > 2) issues.push('more than 2 plain wipes');
  if (plan.format === 'short' && plan.total > 30 * 52) issues.push('Short longer than 52s');
  return issues;
};
