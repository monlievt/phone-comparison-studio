import React from 'react';
import {theme} from '../theme';

// Disabled for now (theme.flags.showWatermark = false). Turn on once the channel name exists.
export const Watermark: React.FC = () => {
  if (!theme.flags.showWatermark || !theme.watermark.text) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: 24,
        left: 32,
        fontFamily: theme.fonts.text,
        fontWeight: 700,
        fontSize: 26,
        color: theme.colors.inkSoft,
        opacity: 0.7,
      }}
    >
      {theme.watermark.text}
    </div>
  );
};
