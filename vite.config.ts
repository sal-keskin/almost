import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022' },
  test: { include: ['tests/**/*.test.ts'] },
} as any);
