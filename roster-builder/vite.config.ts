import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' — сборку можно положить в любую папку за Nginx (например /roster/)
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
});
