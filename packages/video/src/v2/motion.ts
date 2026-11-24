export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
// Enter: slow and firm (strong ease-out). Exit: fast (ease-in). Never symmetrical.
export const easeOut = (t: number): number => 1 - Math.pow(1 - clamp01(t), 4);
export const easeIn = (t: number): number => Math.pow(clamp01(t), 3);
export const easeInOut = (t: number): number => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

export const ENTER = 28; // frames
export const EXIT = 10;
export const OVERLAP = 10; // sections overlap so outgoing and incoming content share the screen
export const MORPH = 22; // stage pose morph between sections

export const enterP = (frame: number, delay = 0, len = ENTER): number => easeOut((frame - delay) / len);
export const exitP = (frame: number, total: number, len = EXIT): number => easeIn((frame - (total - len)) / len);

export const hashStr = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

// Deterministic pseudo-random generator (no Math.random in compositions).
export const seeded = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};
