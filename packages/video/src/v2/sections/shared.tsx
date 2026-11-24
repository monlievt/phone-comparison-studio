import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Comparison} from '../../types';
import {exitP} from '../motion';
import {Layout} from '../layout';
import {Orient, Section} from '../types';

export type SectionProps = {
  src: Comparison;
  section: Section;
  orient: Orient;
  L: Layout;
  last: boolean;
};

// Outgoing content leaves fast (ease-in) while the next section is already entering.
export const Exit: React.FC<{total: number; enabled: boolean; children: React.ReactNode}> = ({total, enabled, children}) => {
  const frame = useCurrentFrame();
  const p = enabled ? exitP(frame, total) : 0;
  return <div style={{position: 'absolute', inset: 0, opacity: 1 - p, transform: `translateY(${-p * 36}px)`}}>{children}</div>;
};

// Column center of phone i in the content layer.
export const colCx = (L: Layout, i: number): number => L.colW * (i + 0.5);

export const credit = (text: string, L: Layout, top: number): React.ReactNode => (
  <div
    data-text-level="credit"
    style={{position: 'absolute', left: 0, right: 0, top, textAlign: 'center', fontSize: L.creditSize, fontWeight: 500, color: 'rgba(20,23,28,0.62)'}}
  >
    {text}
  </div>
);
