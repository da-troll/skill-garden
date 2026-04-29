import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0a',
        panel: '#141414',
        edge: '#1f1f1f',
        ink: '#e5e5e5',
        dim: '#888',
        accent: '#7CFFB2',
        wilson: '#9CDCFE',
        eve: '#FFD580',
        pepper: '#FF9CC2',
        radar: '#C4A8FF',
        c3po: '#FFE36E',
        shared: '#888',
        user: '#7CFFB2',
      },
      fontFamily: { mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'] },
    },
  },
} satisfies Config;
