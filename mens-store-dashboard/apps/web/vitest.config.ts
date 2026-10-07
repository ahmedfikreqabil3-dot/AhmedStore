import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.tsx'],
      exclude: ['src/main.tsx'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 }
    }
  }
});
