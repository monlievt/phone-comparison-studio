import React from 'react';
import {useCurrentFrame} from 'remotion';
import {easeOut} from './motion';

// Deterministic count-up with tabular figures (no layout jitter).
export const CountUp: React.FC<{to: number; start: number; dur?: number; format?: (n: number) => string}> = ({
  to,
  start,
  dur = 36,
  format = (n) => Math.round(n).toLocaleString('en-US'),
}) => {
  const frame = useCurrentFrame();
  const v = to * easeOut((frame - start) / dur);
  return <span style={{fontVariantNumeric: 'tabular-nums'}}>{frame < start ? format(0) : format(v)}</span>;
};
