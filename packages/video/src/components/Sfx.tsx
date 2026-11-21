import React from 'react';
import {Audio, Sequence, interpolate, staticFile, useVideoConfig} from 'remotion';
import {theme} from '../theme';

export type SfxName = 'whoosh' | 'pop' | 'tick' | 'ding' | 'swoosh';

// One-shot sound effect fired at a frame of the current sequence. Same timeline as the animation.
export const Sfx: React.FC<{name: SfxName; at: number; volume?: number}> = ({name, at, volume = 0.6}) => {
  if (!theme.flags.enableAudio) return null;
  return (
    <Sequence from={at} layout="none">
      <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} />
    </Sequence>
  );
};

// Looping instrumental bed with fade in/out. Keep it quiet: there is no voice-over to duck for.
export const Music: React.FC<{src?: string; volume?: number}> = ({src = 'music/placeholder.wav', volume = 0.14}) => {
  const {durationInFrames} = useVideoConfig();
  if (!theme.flags.enableAudio) return null;
  return (
    <Audio
      src={staticFile(src)}
      loop
      volume={(f) =>
        interpolate(f, [0, 30, durationInFrames - 30, durationInFrames], [0, volume, volume, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      }
    />
  );
};
