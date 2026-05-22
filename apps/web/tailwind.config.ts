import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

// Source of truth: design/04-ui.md §1
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Primary (Indigo) ──────────────────────────
        primary: {
          50: '#F3F4FF',
          100: '#E4E6FF',
          200: '#C7CBFF',
          300: '#A2A8FA',
          400: '#7E85F0',
          500: '#5B62E3',
          600: '#4147C9',
          700: '#3236A3',
          800: '#272A82',
          900: '#1B1D63',
          950: '#0F1140',
          DEFAULT: '#5B62E3',
          foreground: '#FFFFFF',
        },
        // ── Neutral (Notion 暖灰) ─────────────────────
        neutral: {
          0: '#FFFFFF',
          50: '#FAFAF9',
          100: '#F4F4F2',
          200: '#E9E9E5',
          300: '#D8D8D2',
          400: '#B8B8AE',
          500: '#8A8A7E',
          600: '#65655B',
          700: '#4C4C45',
          800: '#33332E',
          900: '#1F1F1C',
          950: '#0F0F0E',
        },
        // ── Semantic ──────────────────────────────────
        success: {
          50: '#ECFDF3',
          500: '#16A34A',
          600: '#15803D',
          900: '#052E1A',
          DEFAULT: '#16A34A',
        },
        warning: {
          50: '#FFF7ED',
          500: '#D97706',
          900: '#3A1E03',
          DEFAULT: '#D97706',
        },
        danger: {
          50: '#FEF2F2',
          500: '#DC2626',
          600: '#B91C1C',
          900: '#3F1212',
          DEFAULT: '#DC2626',
        },
        info: {
          50: '#F0F9FF',
          500: '#0284C7',
          900: '#082E45',
          DEFAULT: '#0284C7',
        },
        // ── 业务语义色 ────────────────────────────────
        trust: {
          official: { fg: '#15803D', bg: '#DCFCE7' },
          'self-hosted': { fg: '#1D4ED8', bg: '#DBEAFE' },
          'third-party': { fg: '#B45309', bg: '#FEF3C7' },
        },
        status: {
          pending: '#65655B',
          running: '#0284C7',
          succeeded: '#16A34A',
          failed: '#DC2626',
          timeout: '#D97706',
          'budget-exceeded': '#EA580C',
          skipped: '#A8A89E',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'SF Pro Text',
          'PingFang SC',
          'Source Han Sans CN',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        xs: ['0.75rem', '1rem'],
        sm: ['0.875rem', '1.25rem'],
        base: ['1rem', '1.5rem'],
        md: ['1.125rem', '1.75rem'],
        lg: ['1.25rem', '1.75rem'],
        xl: ['1.5rem', '2rem'],
        '2xl': ['1.875rem', '2.25rem'],
        '3xl': ['2.25rem', '2.5rem'],
      },
      spacing: {
        '0.5': '2px',
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
        '10': '40px',
        '12': '48px',
        '16': '64px',
        '20': '80px',
        '24': '96px',
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(15,17,64,.04)',
        md: '0 2px 8px rgba(15,17,64,.06)',
        lg: '0 8px 24px rgba(15,17,64,.08)',
        xl: '0 16px 48px rgba(15,17,64,.12)',
        focus: '0 0 0 3px rgba(91,98,227,.32)',
      },
      transitionDuration: {
        fast: '100ms',
        normal: '200ms',
        slow: '400ms',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(.2,.8,.2,1)',
      },
    },
  },
  plugins: [animate],
};

export default config;
