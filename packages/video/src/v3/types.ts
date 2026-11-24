import {Comparison} from '../types';

export type Format = 'long' | 'short';
export type Orient = 'land' | 'port';
export type MotionPreset = 'gradientDrift' | 'blobs' | 'gridBreath' | 'rotatingShapes';
export const MOTION_PRESETS: MotionPreset[] = ['gradientDrift', 'blobs', 'gridBreath', 'rotatingShapes'];
// slide = title mask slide-up (no overlay), flipIn = cards flip in from depth, circle/band = overlay object wipes.
export type TransitionKind = 'slide' | 'flipIn' | 'circle' | 'band';
export type SectionKind = 'intro' | 'hook' | 'category' | 'benchmark' | 'recap' | 'outro' | 'winner';

export type Section = {
  kind: SectionKind;
  start: number; // global frame
  dur: number;
  transition: TransitionKind; // how this section is entered (ignored for the first one)
  catIndex?: number;
  benchIndex?: number;
};

export type V3Props = {
  comparison: Comparison;
  format?: Format;
  motionPreset?: MotionPreset; // default: rotated from the seed so consecutive videos differ
  seed?: string; // default: comparison.id
};

export type Plan = {
  sections: Section[];
  total: number;
  src: Comparison; // the comparison actually shown (Short = reduced categories)
  format: Format;
  motionPreset: MotionPreset;
  fingerprint: string;
};
