import React from 'react';
import {Img, staticFile} from 'remotion';
import {fit} from '../lib/fit';
import {rgba} from '../lib/color';
import {Phone} from '../types';
import {theme} from '../theme';
import {DEFAULT_RATIO, ParametricPhone, shapeGeometry} from './ParametricPhone';
import {Pose} from './poses';

const imgSrc = (src: string): string => (/^(https?:|data:)/.test(src) ? src : staticFile(src));

export const phoneHeight = (phone: Phone, width: number): number =>
  phone.image ? width * DEFAULT_RATIO : shapeGeometry(phone.shape, width).height;

// One phone on the stage: licensed photo when present, otherwise the parametric illustration. A name chip stays attached.
export const PhoneActor: React.FC<{
  phone: Phone;
  pose: Pose;
  scale?: number;
  chipSize: number;
  maxChipWidth?: number;
  showChip?: boolean;
}> = ({
  phone,
  pose,
  scale = 1,
  chipSize,
  maxChipWidth,
  showChip = true,
}) => {
  const w = pose.w;
  const h = phoneHeight(phone, w);
  const chipLimit = maxChipWidth ?? Math.max(w * 1.5, 280);
  const padX = Math.min(chipSize * 0.5, chipLimit * 0.08);
  const innerLimit = Math.max(80, chipLimit - padX * 2);
  return (
    <div
      style={{
        position: 'absolute',
        left: pose.cx - w / 2,
        top: pose.top,
        width: w,
        opacity: pose.op,
        transform: `rotate(${pose.rot}deg) scale(${scale})`,
        transformOrigin: '50% 60%',
        filter: `drop-shadow(0 ${22 + 18 * pose.glow}px ${38 + 26 * pose.glow}px ${rgba(phone.accent, 0.3 + 0.28 * pose.glow)})`,
      }}
    >
      {phone.image ? (
        <Img src={imgSrc(phone.image.src)} style={{width: w, height: h, objectFit: 'contain', objectPosition: 'top center', display: 'block'}} />
      ) : (
        <ParametricPhone shape={phone.shape} accent={phone.accent} width={w} />
      )}
      {showChip ? (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: h + 16,
            transform: 'translateX(-50%)',
            maxWidth: chipLimit,
            boxSizing: 'border-box',
            padding: `${Math.round(chipSize * 0.18)}px ${Math.round(padX)}px`,
            borderRadius: chipSize,
            background: theme.colors.ink,
            borderBottom: `${Math.max(5, Math.round(chipSize * 0.1))}px solid ${phone.accent}`,
            boxShadow: '0 8px 22px rgba(20,23,28,0.22)',
            fontFamily: theme.fonts.display,
            fontWeight: 700,
            fontSize: fit(phone.name, chipSize, innerLimit, 0.52),
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: theme.colors.white,
          }}
        >
          {phone.name}
        </div>
      ) : null}
    </div>
  );
};
