import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Brand (teal-based) ──────────────────────────────────────────
        brand: {
          50:  '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',  // primary
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },

        // ── Game-X (warm red) ───────────────────────────────────────────
        'game-x': {
          DEFAULT: '#E24B4A',
          light:   '#f07574',
          dark:    '#b83635',
          glow:    'rgba(226, 75, 74, 0.35)',
        },

        // ── Game-O (electric blue) ──────────────────────────────────────
        'game-o': {
          DEFAULT: '#378ADD',
          light:   '#62a6e8',
          dark:    '#2568b0',
          glow:    'rgba(55, 138, 221, 0.35)',
        },

        // ── Game board background (deep navy/slate) ─────────────────────
        'game-bg': {
          DEFAULT:  '#0f172a',
          surface:  '#1e293b',
          elevated: '#263346',
          border:   '#334155',
          muted:    '#475569',
        },

        // ── Neutral surface tokens (complement dark UI) ─────────────────
        surface: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          800: '#1e293b',
          900: '#0f172a',
          950: '#060d1a',
        },
      },

      fontFamily: {
        sans:  ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono:  ['JetBrains Mono', 'ui-monospace', 'monospace'],
        display: ['Outfit', 'Inter', 'sans-serif'],
      },

      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },

      boxShadow: {
        'x-glow':     '0 0 20px rgba(226, 75, 74, 0.4), 0 0 60px rgba(226, 75, 74, 0.15)',
        'o-glow':     '0 0 20px rgba(55, 138, 221, 0.4), 0 0 60px rgba(55, 138, 221, 0.15)',
        'brand-glow': '0 0 20px rgba(20, 184, 166, 0.4), 0 0 60px rgba(20, 184, 166, 0.15)',
        'dark-lg':    '0 10px 40px rgba(0, 0, 0, 0.4)',
        'dark-xl':    '0 20px 60px rgba(0, 0, 0, 0.6)',
      },

      animation: {
        'pulse-x':       'pulse-x 2s ease-in-out infinite',
        'pulse-o':       'pulse-o 2s ease-in-out infinite',
        'float':         'float 3s ease-in-out infinite',
        'shimmer':       'shimmer 1.5s linear infinite',
        'slide-in-up':   'slideInUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in':       'fadeIn 0.25s ease-out',
        'scale-in':      'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        'timer-drain':   'timerDrain linear forwards',
      },

      keyframes: {
        'pulse-x': {
          '0%, 100%': { boxShadow: '0 0 15px rgba(226, 75, 74, 0.3)' },
          '50%':      { boxShadow: '0 0 30px rgba(226, 75, 74, 0.7)' },
        },
        'pulse-o': {
          '0%, 100%': { boxShadow: '0 0 15px rgba(55, 138, 221, 0.3)' },
          '50%':      { boxShadow: '0 0 30px rgba(55, 138, 221, 0.7)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-8px)' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'slideInUp': {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fadeIn': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scaleIn': {
          '0%':   { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'timerDrain': {
          '0%':   { width: '100%' },
          '100%': { width: '0%' },
        },
      },

      backgroundImage: {
        'gradient-radial':    'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':     'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'board-grid':         'linear-gradient(#334155 1px, transparent 1px), linear-gradient(90deg, #334155 1px, transparent 1px)',
        'shimmer-gradient':   'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)',
      },
    },
  },
  plugins: [forms],
};

export default config;
