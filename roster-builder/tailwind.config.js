/** Токены совпадают с WarpHub Mini App (тёмная тема, лаймовый акцент). */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)', foreground: 'rgb(var(--color-accent-foreground) / <alpha-value>)' },
        app: {
          DEFAULT: 'var(--color-bg)',
          elevated: 'var(--color-bg-elevated)',
          surface: 'var(--color-bg-surface)',
          muted: 'var(--color-bg-muted)',
          subtle: 'var(--color-bg-subtle)',
        },
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        warn: 'rgb(var(--color-warn) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Inter Tight"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Oswald', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
