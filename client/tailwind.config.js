/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // hover-стили только там, где есть мышь: на телефоне не «залипают» после касания
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          foreground: 'rgb(var(--color-accent-foreground) / <alpha-value>)',
        },
        app: {
          // DEFAULT с <alpha-value> — для полупрозрачных фонов вроде bg-app/95 (Roster Builder)
          DEFAULT: 'rgb(var(--color-bg-rgb) / <alpha-value>)',
          bg: 'var(--color-bg)',
          elevated: 'var(--color-bg-elevated)',
          surface: 'var(--color-bg-surface)',
          muted: 'var(--color-bg-muted)',
          subtle: 'var(--color-bg-subtle)',
        },
        overlay: 'rgb(var(--color-overlay) / <alpha-value>)',
        'overlay-strong': 'rgb(var(--color-overlay-strong) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        warn: 'rgb(var(--color-warn) / <alpha-value>)',
        muted: 'var(--color-text-muted)',
        // текст дизайн-системы: fg — основной, fg-2 — второстепенный, fg-3 — подписи (D2)
        fg: {
          DEFAULT: 'rgb(var(--color-text) / <alpha-value>)',
          2: 'rgb(var(--color-text-2) / <alpha-value>)',
          3: 'rgb(var(--color-text-3) / <alpha-value>)',
        },
        field: 'var(--color-bg-field)',
        subtle: 'var(--color-text-subtle)',
      },
      fontFamily: {
        display: ['Oswald', 'sans-serif'],
      },
      transitionTimingFunction: {
        'out-soft': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
    },
  },
  plugins: [],
};
