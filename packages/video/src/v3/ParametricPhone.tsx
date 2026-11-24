import React from 'react';
import {rgba} from '../lib/color';
import {PhoneShape} from '../types';

export const DEFAULT_RATIO = 2.15;
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

// Geometry of the front view. All mm values are converted to pixels with width / body width.
export const shapeGeometry = (shape: PhoneShape | undefined, width: number) => {
  const body = shape?.bodyMM ?? null;
  const ratio = body ? body.h / body.w : DEFAULT_RATIO;
  const pxPerMm = width / (body?.w ?? 72);
  let side = 2.5;
  let top = 3.5;
  let chin = 4;
  if (body && shape?.screenInch && shape?.aspect) {
    // screen width = diagonal / sqrt(1 + aspect^2); bezel = (body - screen) / 2
    const diag = shape.screenInch * 25.4;
    const sw = diag / Math.sqrt(1 + shape.aspect * shape.aspect);
    const sh = sw * shape.aspect;
    side = clamp((body.w - sw) / 2, 1, 6);
    const vert = (body.h - sh) / 2;
    chin = clamp(vert, 1.5, 9);
    top = clamp(vert * 0.85, 1.5, 8);
  }
  return {
    ratio,
    height: width * ratio,
    side: side * pxPerMm,
    top: top * pxPerMm,
    chin: chin * pxPerMm,
    radius: width * (shape?.frame === 'round' ? 0.17 : 0.13),
  };
};

// Illustrated phone drawn from specs: proportions, bezels, front camera style, edge. No brand marks, no logos.
export const ParametricPhone: React.FC<{shape?: PhoneShape; accent: string; width: number}> = ({shape, accent, width}) => {
  const g = shapeGeometry(shape, width);
  const cam = shape?.frontCamera ?? 'punch_center';
  const edge = shape?.edge ?? 'flat';
  const screenR = Math.max(g.radius - g.side * 0.7, width * 0.05);
  const dot = width * 0.042;
  const camTop = Math.max(g.top * 0.55, dot * 0.5);

  const cutout = (): React.ReactNode => {
    const base: React.CSSProperties = {position: 'absolute', background: '#0B0C0F'};
    switch (cam) {
      case 'punch_left':
        return <div style={{...base, left: width * 0.1, top: camTop, width: dot, height: dot, borderRadius: '50%'}} />;
      case 'punch_right':
        return <div style={{...base, right: width * 0.1, top: camTop, width: dot, height: dot, borderRadius: '50%'}} />;
      case 'waterdrop':
        return <div style={{...base, left: '50%', top: 0, width: width * 0.1, height: width * 0.055, marginLeft: -width * 0.05, borderRadius: `0 0 ${width * 0.05}px ${width * 0.05}px`}} />;
      case 'notch':
        return <div style={{...base, left: '50%', top: 0, width: width * 0.36, height: width * 0.07, marginLeft: -width * 0.18, borderRadius: `0 0 ${width * 0.04}px ${width * 0.04}px`}} />;
      case 'pill':
        return <div style={{...base, left: '50%', top: camTop, width: width * 0.24, height: width * 0.065, marginLeft: -width * 0.12, borderRadius: width}} />;
      case 'under_display':
        return null;
      default:
        return <div style={{...base, left: '50%', top: camTop, width: dot, height: dot, marginLeft: -dot / 2, borderRadius: '50%'}} />;
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        width,
        height: g.height,
        borderRadius: g.radius,
        background: '#14161B',
        boxShadow: `inset 0 0 0 ${Math.max(1.5, width * 0.008)}px rgba(255,255,255,0.14)`,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: g.side,
          right: g.side,
          top: g.top,
          bottom: g.chin,
          borderRadius: screenR,
          overflow: 'hidden',
          background: `linear-gradient(165deg, ${accent} 0%, ${rgba(accent, 0.62)} 55%, #101216 150%)`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: width * 1.2,
            height: width * 1.2,
            borderRadius: '50%',
            right: -width * 0.4,
            top: width * 0.55,
            background: 'radial-gradient(circle, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0) 65%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: width * 0.8,
            height: width * 0.8,
            borderRadius: '50%',
            left: -width * 0.3,
            bottom: -width * 0.1,
            background: 'radial-gradient(circle, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 65%)',
          }}
        />
        {edge !== 'flat' && edge !== 'unknown' ? (
          <>
            <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: width * (edge === 'dual_curve' ? 0.08 : 0.05), background: 'linear-gradient(90deg, rgba(255,255,255,0.28), rgba(255,255,255,0))'}} />
            <div style={{position: 'absolute', right: 0, top: 0, bottom: 0, width: width * (edge === 'dual_curve' ? 0.08 : 0.05), background: 'linear-gradient(270deg, rgba(255,255,255,0.28), rgba(255,255,255,0))'}} />
          </>
        ) : null}
        {cutout()}
      </div>
    </div>
  );
};
