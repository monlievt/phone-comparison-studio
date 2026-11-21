import React from 'react';
import { rgba } from '../lib/color';
import { theme } from '../theme';

export interface ParametricPhoneShape {
  bodyMM?: { h: number; w: number; d: number } | null;
  screenInch?: number | null;
  aspect?: number | null;
  frontCamera?: 'punch_center' | 'punch_left' | 'punch_right' | 'waterdrop' | 'notch' | 'pill' | 'under_display' | 'unknown';
  edge?: 'flat' | 'curved' | 'dual_curve' | 'unknown';
  frame?: 'flat' | 'round' | 'unknown';
}

export interface ParametricPhoneProps {
  width: number;
  height: number;
  accent: string;
  shape?: ParametricPhoneShape | null;
}

export function computeBezel(shape?: ParametricPhoneShape | null): { sideBezelPct: number; cornerRadiusPct: number } {
  // Default values
  let sideBezelPct = 0.035;
  let cornerRadiusPct = 0.12;

  if (shape?.edge === 'curved' || shape?.edge === 'dual_curve') {
    sideBezelPct = 0.02; // Curved edges look thinner
  }

  if (shape?.frame === 'flat') {
    cornerRadiusPct = 0.10;
  }

  return { sideBezelPct, cornerRadiusPct };
}

export const ParametricPhone: React.FC<ParametricPhoneProps> = ({
  width,
  height,
  accent,
  shape,
}) => {
  const { sideBezelPct, cornerRadiusPct } = computeBezel(shape);
  const bezelPx = Math.max(3, width * sideBezelPct);
  const cornerRadiusPx = width * cornerRadiusPct;

  const cameraStyle = shape?.frontCamera ?? 'punch_center';

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        boxSizing: 'border-box',
        padding: bezelPx,
        borderRadius: cornerRadiusPx,
        background: shape?.frame === 'round' ? '#1c1f24' : '#121417',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: `inset 0 0 0 1px ${rgba(accent, 0.2)}`,
      }}
    >
      {/* Screen area */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          borderRadius: Math.max(2, cornerRadiusPx - bezelPx),
          background: `linear-gradient(160deg, ${accent} 0%, ${rgba(accent, 0.45)} 60%, #0d0f12 100%)`,
        }}
      >
        {/* Subtle screen wallpaper glow */}
        <div
          style={{
            position: 'absolute',
            width: width * 1.2,
            height: width * 1.2,
            borderRadius: '50%',
            right: -width * 0.4,
            top: width * 0.4,
            background: 'radial-gradient(circle, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0) 70%)',
          }}
        />

        {/* Front camera notch/punch cutout */}
        {renderFrontCamera(cameraStyle, width)}

        {/* Clean wallpaper clock */}
        <div
          style={{
            position: 'absolute',
            top: '12%',
            width: '100%',
            textAlign: 'center',
            fontFamily: theme.fonts.display,
            fontWeight: 700,
            fontSize: width * 0.18,
            color: 'rgba(255, 255, 255, 0.95)',
            letterSpacing: '1px',
            textShadow: '0 2px 10px rgba(0,0,0,0.5)',
          }}
        >
          09:41
        </div>

        {/* Illustration label per VIDEO_SPEC §8 */}
        <div
          style={{
            position: 'absolute',
            bottom: '4%',
            width: '100%',
            textAlign: 'center',
            fontFamily: theme.fonts.body,
            fontSize: Math.max(9, width * 0.04),
            color: 'rgba(255, 255, 255, 0.4)',
            letterSpacing: '0.5px',
          }}
        >
          ILLUSTRATION
        </div>
      </div>
    </div>
  );
};

function renderFrontCamera(style: string, width: number) {
  if (style === 'under_display') return null;

  if (style === 'notch') {
    return (
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          width: width * 0.28,
          height: width * 0.065,
          marginLeft: -width * 0.14,
          background: '#0d0f12',
          borderBottomLeftRadius: width * 0.03,
          borderBottomRightRadius: width * 0.03,
        }}
      />
    );
  }

  if (style === 'pill') {
    return (
      <div
        style={{
          position: 'absolute',
          top: '3%',
          left: '50%',
          width: width * 0.22,
          height: width * 0.05,
          marginLeft: -width * 0.11,
          borderRadius: width * 0.025,
          background: '#0d0f12',
        }}
      />
    );
  }

  if (style === 'waterdrop') {
    return (
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          width: width * 0.08,
          height: width * 0.07,
          marginLeft: -width * 0.04,
          background: '#0d0f12',
          borderBottomLeftRadius: '50%',
          borderBottomRightRadius: '50%',
        }}
      />
    );
  }

  // Punch holes
  let leftPos = '50%';
  let marginLeft = -width * 0.025;
  if (style === 'punch_left') {
    leftPos = '12%';
    marginLeft = 0;
  } else if (style === 'punch_right') {
    leftPos = '88%';
    marginLeft = -width * 0.05;
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: '3.2%',
        left: leftPos,
        width: width * 0.05,
        height: width * 0.05,
        marginLeft,
        borderRadius: '50%',
        background: '#0d0f12',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    />
  );
}
