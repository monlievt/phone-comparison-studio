// apps/web/tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Wise Design System Color Tokens
        primary: {
          DEFAULT: '#9fe870', // Wise lime-green CTA accent
          active: '#cdffad',
          neutral: '#c5edab',
          pale: '#e2f6d5',
          dark: '#163300',
        },
        ink: {
          DEFAULT: '#0e0f0c', // Near-black with olive warmth
          deep: '#163300',
        },
        body: '#454745',
        mute: '#868685',
        canvas: {
          DEFAULT: '#ffffff', // Pure white card surface
          soft: '#e8ebe6',    // Signature pale sage canvas
        },
        positive: {
          DEFAULT: '#2ead4b',
          deep: '#054d28',
        },
        warning: {
          DEFAULT: '#ffd11a',
          deep: '#b86700',
          content: '#4a3b1c',
        },
        negative: {
          DEFAULT: '#d03238',
          deep: '#a72027',
          darkest: '#a7000d',
          bg: '#320707',
        },
        accent: {
          orange: '#ffc091',
          cyan: '#38c8ff',
        },
      },
      borderRadius: {
        'wise-card': '24px',
        'wise-pill': '9999px',
        'wise-input': '12px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
