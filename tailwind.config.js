/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Tokens semânticos (valores claro/escuro em src/index.css, canais RGB)
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          raised:  'rgb(var(--surface-raised) / <alpha-value>)',
          muted:   'rgb(var(--surface-muted) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          muted:   'rgb(var(--ink-muted) / <alpha-value>)',
        },
        line:    'rgb(var(--line) / <alpha-value>)',
        accent: {
          DEFAULT:    'rgb(var(--accent) / <alpha-value>)',
          foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
          ink:        'rgb(var(--accent-ink) / <alpha-value>)',
        },
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        danger:  'rgb(var(--danger) / <alpha-value>)',
        focus:   'rgb(var(--focus-ring) / <alpha-value>)',
        brand: {
          gold: '#C9A84C',
          'gold-50':  '#FCF8EC',
          'gold-100': '#F5EBC8',
          'gold-200': '#EBD89C',
          'gold-300': '#E0C570',
          'gold-400': '#D5B65A',
          'gold-500': '#C9A84C',
          'gold-600': '#A8893B',
          'gold-700': '#866B2D',
          'gold-light': '#E8D08A',
          dark: '#0d0d0d',
          'dark-light': '#1a1a1a',
          'dark-700': '#262626',
          'dark-800': '#171717',
          'dark-900': '#0d0d0d',
          green:  '#16a34a',
          yellow: '#ca8a04',
          red:    '#dc2626',
        },
      },
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Newsreader', 'ui-serif', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // Escala: 12 / 13 / 14 / 16 / 20 / 24 / 32 (xs, ui, sm, base, xl, 2xl, display).
        // 11 px só para rótulos curtos em maiúsculas (overline).
        'overline': ['11px', { lineHeight: '16px', letterSpacing: '0.06em' }],
        'caption':  ['12px', { lineHeight: '16px' }],
        'ui':       ['13px', { lineHeight: '20px' }],
        'title':    ['24px', { lineHeight: '32px', letterSpacing: '-0.01em' }],
        'display':  ['32px', { lineHeight: '40px', letterSpacing: '-0.015em' }],
      },
      borderRadius: {
        'xs': '4px',
        'sm': '6px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
      },
      boxShadow: {
        'xs':    '0 1px 2px 0 rgba(15, 15, 15, 0.04)',
        'sm':    '0 1px 3px 0 rgba(15, 15, 15, 0.06), 0 1px 2px 0 rgba(15, 15, 15, 0.04)',
        'md':    '0 4px 6px -1px rgba(15, 15, 15, 0.08), 0 2px 4px -1px rgba(15, 15, 15, 0.04)',
        'lg':    '0 10px 15px -3px rgba(15, 15, 15, 0.08), 0 4px 6px -2px rgba(15, 15, 15, 0.04)',
        'xl':    '0 20px 25px -5px rgba(15, 15, 15, 0.1), 0 10px 10px -5px rgba(15, 15, 15, 0.04)',
        'gold':  '0 4px 14px 0 rgba(201, 168, 76, 0.25)',
        'gold-lg': '0 10px 30px -5px rgba(201, 168, 76, 0.35)',
      },
      // Movimento: ver src/lib/motion.js (mesmos valores para framer-motion)
      transitionDuration: {
        fast: '120ms', base: '180ms', moderate: '260ms', slow: '380ms',
      },
      transitionTimingFunction: {
        entry: 'cubic-bezier(0.22, 1, 0.36, 1)',
        exit:  'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      animation: {
        'fade-in':    'fadeIn 180ms cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-up':   'slideUp 260ms cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-down': 'slideDown 260ms cubic-bezier(0.22, 1, 0.36, 1)',
        'scale-in':   'scaleIn 180ms cubic-bezier(0.22, 1, 0.36, 1)',
        'shimmer':    'shimmer 1.5s linear infinite',
      },
      keyframes: {
        fadeIn:    { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideUp:   { '0%': { opacity: 0, transform: 'translateY(6px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        slideDown: { '0%': { opacity: 0, transform: 'translateY(-6px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        scaleIn:   { '0%': { opacity: 0, transform: 'scale(0.98)' }, '100%': { opacity: 1, transform: 'scale(1)' } },
        shimmer:   { '0%': { backgroundPosition: '-1000px 0' }, '100%': { backgroundPosition: '1000px 0' } },
      },
    },
  },
  plugins: [],
}
