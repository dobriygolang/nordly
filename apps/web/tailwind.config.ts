import type { Config } from 'tailwindcss'

/** Nordly web Tailwind theme. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        site: {
          bg: 'rgb(var(--site-bg) / <alpha-value>)',
          surface: 'rgb(var(--site-surface) / <alpha-value>)',
          card: 'rgb(var(--site-card) / <alpha-value>)',
          border: 'rgb(var(--site-border) / <alpha-value>)',
          text: 'rgb(var(--site-text) / <alpha-value>)',
          muted: 'rgb(var(--site-muted) / <alpha-value>)',
          accent: 'rgb(var(--site-accent) / <alpha-value>)',
          'accent-fg': 'rgb(var(--site-accent-fg) / <alpha-value>)',
        },
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        surface: {
          1: 'rgb(var(--color-surface-1) / <alpha-value>)',
          2: 'rgb(var(--color-surface-2) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--color-border) / <alpha-value>)',
          strong: 'rgb(var(--color-border-strong) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--color-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--color-text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--color-text-muted) / <alpha-value>)',
        },
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        warn: 'rgb(var(--color-warn) / <alpha-value>)',
      },
      borderRadius: { sm: '6px', md: '8px', lg: '12px', xl: '16px', '2xl': '20px' },
      boxShadow: {
        card: '0 1px 3px rgba(15, 15, 15, 0.06)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeInUp: 'fadeInUp 0.8s ease-out forwards',
      },
    },
  },
  plugins: [],
} satisfies Config
