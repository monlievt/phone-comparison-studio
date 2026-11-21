import React from 'react';
import {Img, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {rgba} from '../lib/color';
import {useEmphasis} from '../lib/emphasis';
import {Phone} from '../types';
import {theme} from '../theme';

export const PHONE_RATIO = 2.1; // height / width of the generic mockup

// Phone with a licensed image when available, otherwise a generic device in the phone's accent color.
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
  const bezel = width * 0.04;

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
        <Img src={phone.image.src} style={{width: '100%', height: '100%', objectFit: 'contain'}} />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            padding: bezel,
            borderRadius: width * 0.15,
            background: '#101216',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              overflow: 'hidden',
              borderRadius: width * 0.115,
              background: `linear-gradient(165deg, ${phone.accent} 0%, ${rgba(phone.accent, 0.6)} 55%, #101216 140%)`,
            }}
          >
            <div
              style={{
                position: 'absolute',
                width: width * 1.1,
                height: width * 1.1,
                borderRadius: '50%',
                right: -width * 0.35,
                top: width * 0.5,
                background: 'radial-gradient(circle, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 65%)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: '3.2%',
                left: '50%',
                width: width * 0.045,
                height: width * 0.045,
                marginLeft: -width * 0.0225,
                borderRadius: '50%',
                background: '#101216',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: '13%',
                width: '100%',
                textAlign: 'center',
                fontFamily: theme.fonts.display,
                fontWeight: 700,
                fontSize: width * 0.2,
                color: 'rgba(255,255,255,0.92)',
              }}
            >
              9:41
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
