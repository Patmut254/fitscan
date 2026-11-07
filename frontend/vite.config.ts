/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    host: true,
    // In development the Django API runs on :8000; Vite forwards /api to it.
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  build: {
    rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom'] } } },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
