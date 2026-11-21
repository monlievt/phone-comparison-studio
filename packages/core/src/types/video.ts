// packages/core/src/types/video.ts
// Re-export the existing Remotion render contract from packages/video,
// extended with the new fields added in DATA_MODEL.md §3.

// --- Re-exported base types (from packages/video/src/types.ts) ---
export type PhoneImage = {
  src: string;        // path inside /public (after Image Resolver copies it), or URL
  license: string;    // required: e.g. "Official press kit", "CC BY 4.0"
  sourceUrl: string;
  accessedAt: string; // ISO date — added field
  author?: string;
};

export type Phone = {
  id: string;
  name: string;
  accent: string;
  priceUSD?: number;
  image?: PhoneImage;
  // Extended fields (optional for existing compositions)
  soc?: string;
  releaseDate?: string;
  priceNote?: string; // e.g. 'Launch price, approx.'
};

export type CategoryValue = {
  primary: string;
  secondary?: string;
};

export type Category = {
  key: string;
  label: string;
  values: CategoryValue[];
  ranking: number[];
  weight?: number;
};

export type BenchmarkScoreSet = {
  main: number;
  parts: Record<string, number>;
};

export type BenchmarkPart = { key: string; label: string };

export type BenchmarkData = {
  id: string;
  source: string;
  title: string;
  version: string;
  updated: string;
  sourceUrl: string;
  note?: string;
  subtitle?: string;
  parts: BenchmarkPart[];
  scores: (BenchmarkScoreSet | null)[];
  lowerIsBetter?: boolean;
};

export type Comparison = {
  id: string;
  phones: Phone[];
  categories: Category[];
  benchmarks?: BenchmarkData[];
  // Extended fields required by new compositions
  title?: string;
  market: 'global';
  currency: 'USD';
  overall?: { ranking: number[]; points: number[] };
  hook?: string;                        // Short hook text, <= 40 chars
  labels?: Record<string, string>;      // category_key -> label override
  credits: string[];                    // data/image/music credits for description
};

// Segment prop types
export type SegmentProps = { comparison: Comparison; categoryIndex: number };
export type VideoProps = { comparison: Comparison };
export type BenchmarkProps = { comparison: Comparison; benchmarkIndex: number };

// --- PhoneShape: drives the ParametricPhone component ---
export type FrontCameraStyle =
  | 'punch_center'
  | 'punch_left'
  | 'punch_right'
  | 'waterdrop'
  | 'notch'
  | 'pill'
  | 'under_display'
  | 'unknown';

export type PhoneShape = {
  bodyMM: { h: number; w: number; d: number } | null;
  screenInch: number | null;
  aspect: number | null;               // e.g. 20/9 -> 2.22
  frontCamera: FrontCameraStyle;
  edge: 'flat' | 'curved' | 'dual_curve' | 'unknown';
  frame: 'flat' | 'round' | 'unknown';
  rearLenses: 1 | 2 | 3 | 4 | null;
  evidence: Record<string, string | null>; // verbatim snippet per field
};
