import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'out',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          // 1. Large Data Processors (Isolated to keep main bundle smaller)
          if (id.includes('/gpt-tokenizer/')) return 'vendor-gpt';
          if (id.includes('/pdfjs-dist/')) return 'vendor-pdf';

          // 2. Unified Vendor Chunk
          // Consolidating all other node_modules (React, Three, Firebase, UI, etc.)
          // into one chunk to ensure Rollup handles dependency initialization 
          // order correctly and avoids 'useLayoutEffect' of undefined errors.
          return 'vendor';
        },
      },
    },
  },
})
