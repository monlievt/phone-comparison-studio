import {spring, useCurrentFrame, useVideoConfig} from 'remotion';

// After the reveal moment: winners grow and glow, the others dim.
export const useEmphasis = (revealAt: number, rank: number, phoneCount: number) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const r = frame >= revealAt ? spring({frame: frame - revealAt, fps, config: {damping: 18, stiffness: 120}}) : 0;
  const winner = rank === 1;
  const dimTo = winner ? 1 : phoneCount === 3 && rank === 2 ? 0.8 : 0.55;
  return {
    scale: 1 + (winner ? 0.05 : -0.03) * r,
    opacity: 1 + (dimTo - 1) * r,
    glow: winner ? r : 0,
  };
};
