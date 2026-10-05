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
          bg: 'var(--color-bg)',
          elevated: 'var(--color-bg-elevated)',
          surface: 'var(--color-bg-surface)',
          muted: 'var(--color-bg-muted)',
          subtle: 'var(--color-bg-subtle)',
        },
        overlay: 'rgb(var(--color-overlay) / <alpha-value>)',
        'overlay-strong': 'rgb(var(--color-overlay-strong) / <alpha-value>)',
        muted: 'var(--color-text-muted)',
        subtle: 'var(--color-text-subtle)',
      },
    },
  },
  plugins: [],
};
