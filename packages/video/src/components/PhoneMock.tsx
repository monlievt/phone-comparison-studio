import React from 'react';
import {Img, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {rgba} from '../lib/color';
import {useEmphasis} from '../lib/emphasis';
import {Phone} from '../types';
import {ParametricPhone} from './ParametricPhone';

export const PHONE_RATIO = 2.1; // height / width of the generic mockup

// Resolves image src: if local relative path, wrap with staticFile()
function resolveImageSrc(src: string): string {
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
    return src;
  }
  return staticFile(src.replace(/^\/+/, ''));
}

// Phone with a licensed image when available, otherwise a parametric device mockup.
export const PhoneMock: React.FC<{
  phone: Phone;
  width: number;
  enterAt: number;
  revealAt: number;
  rank: number;
  phoneCount: number;
}> = ({phone, width, enterAt, revealAt, rank, phoneCount}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame: frame - enterAt, fps, config: {damping: 15, stiffness: 120, mass: 0.9}});
  const emph = useEmphasis(revealAt, rank, phoneCount);
  const float = Math.sin((frame / fps) * ((Math.PI * 2) / 3.2)) * 6 * enter;
  const height = width * PHONE_RATIO;

  return (
    <div
      style={{
        width,
        height,
        opacity: Math.min(1, enter * 1.6) * emph.opacity,
        transform: `translateY(${(1 - enter) * 160 + float}px) scale(${emph.scale})`,
        transformOrigin: '50% 100%',
        filter: `drop-shadow(0 ${24 + 20 * emph.glow}px ${40 + 30 * emph.glow}px ${rgba(phone.accent, 0.35 + 0.25 * emph.glow)})`,
      }}
    >
      {phone.image ? (
        <Img src={resolveImageSrc(phone.image.src)} style={{width: '100%', height: '100%', objectFit: 'contain'}} />
      ) : (
        <ParametricPhone
          width={width}
          height={height}
          accent={phone.accent}
        />
      )}
    </div>
  );
};
