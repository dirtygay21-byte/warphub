/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
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
        subtle: 'var(--color-text-subtle)',
      },
      fontFamily: {
        display: ['Oswald', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
