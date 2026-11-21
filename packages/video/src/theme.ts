import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

// Fonts are bundled in public/fonts, so renders never need internet access.
const DISPLAY = 'Barlow Condensed';
const TEXT = 'Manrope';
(['600', '700', '800'] as const).forEach((weight) =>
  loadFont({family: DISPLAY, url: staticFile(`fonts/barlow-condensed-latin-${weight}-normal.woff2`), weight}),
);
(['500', '700'] as const).forEach((weight) =>
  loadFont({family: TEXT, url: staticFile(`fonts/manrope-latin-${weight}-normal.woff2`), weight}),
);

// Brand is not decided yet: neutral theme, accent colors come from each phone.
export const theme = {
  fonts: {display: `'${DISPLAY}', sans-serif`, text: `'${TEXT}', sans-serif`},
  colors: {
    canvas: '#F1F2F4',
    ink: '#14171C',
    inkSoft: '#4B525C',
    white: '#FFFFFF',
    win: '#12B76A',
    silver: '#8A93A0',
  },
  flags: {
    showWatermark: false, // no channel name yet
    enableAudio: true,
  },
  watermark: {text: ''},
} as const;
