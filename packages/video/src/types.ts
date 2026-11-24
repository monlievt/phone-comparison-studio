// Data contract. In production this JSON comes from the approved spec review (Gate A).

export type PhoneImage = {
  src: string; // path inside /public (downloaded by the Image Resolver), or a URL
  license: string; // required: e.g. "Official press kit", "CC BY 4.0"
  sourceUrl: string;
  author?: string;
};

// Drives the parametric (illustrated) phone when no licensed photo exists. Every field is optional:
// unknown values fall back to typical defaults at render time. Source: spec collector, with evidence.
export type PhoneShape = {
  bodyMM?: {h: number; w: number; d: number} | null;
  screenInch?: number | null;
  aspect?: number | null; // screen height / width, e.g. 2.22 for 20:9
  frontCamera?: 'punch_center' | 'punch_left' | 'punch_right' | 'waterdrop' | 'notch' | 'pill' | 'under_display' | 'unknown';
  edge?: 'flat' | 'curved' | 'dual_curve' | 'unknown';
  frame?: 'flat' | 'round' | 'unknown';
  rearLenses?: 1 | 2 | 3 | 4 | null; // reserved: rear view is not drawn yet
};

export type Phone = {
  id: string;
  name: string;
  accent: string; // dominant color, drives the background field of this phone
  priceUSD?: number;
  image?: PhoneImage; // when missing, a generic device mockup is drawn
  shape?: PhoneShape; // used by the V2 template's parametric phone
};

export type CategoryValue = {
  primary: string; // big text, e.g. "144 Hz"
  secondary?: string; // small text, e.g. "AMOLED"
};

export type Category = {
  key: string;
  label: string; // shown as the segment title
  values: CategoryValue[]; // one per phone, same order as phones
  ranking: number[]; // 1 = best; equal numbers = tie (computed by the verdict engine, never by the AI)
  weight?: number;
};

export type Comparison = {
  id: string;
  phones: Phone[]; // 2 or 3
  categories: Category[];
  benchmarks?: BenchmarkData[]; // each one becomes a final segment, only when every phone has a score
  title?: string;
  overall?: { ranking: number[]; points: number[] };
  hook?: string;
  themePreset?: string;
};

export type SegmentProps = {comparison: Comparison; categoryIndex: number};
export type VideoProps = {comparison: Comparison};
export type BenchmarkProps = {comparison: Comparison; benchmarkIndex: number};

// Generic benchmark data (AnTuTu, Geekbench, 3DMark, DXOMARK, or derived values like performance per dollar).
// Scores are only comparable within the same source and version, so one segment = one source.
export type BenchmarkScoreSet = {
  main: number; // headline number (e.g. AnTuTu total, Geekbench multi-core)
  parts: Record<string, number>; // breakdown values keyed by BenchmarkPart.key
};

export type BenchmarkPart = {key: string; label: string};

export type BenchmarkData = {
  id: string; // 'antutu' | 'geekbench' | '3dmark' | 'value' | ...
  source: string; // e.g. "AnTuTu"
  title: string; // segment title, e.g. "AnTuTu score"
  version: string; // e.g. "V12"
  updated: string; // e.g. "Oct 2026"
  sourceUrl: string;
  note?: string; // appended to the subtitle
  subtitle?: string; // full override of the subtitle
  parts: BenchmarkPart[]; // 0 to 4 breakdown metrics
  scores: (BenchmarkScoreSet | null)[]; // one per phone; null = phone not covered by this source
  lowerIsBetter?: boolean;
};
