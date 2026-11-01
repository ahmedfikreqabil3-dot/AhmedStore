import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../../.local/design-build',
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL('./design-preview.html', import.meta.url)) }
  }
});
