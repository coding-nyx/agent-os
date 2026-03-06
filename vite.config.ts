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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          // React must be checked before @react-three/* (paths contain '/react/')
          if (id.includes('/react-dom/') || id.includes('/scheduler/') ||
              (id.includes('/react/') && !id.includes('@react-three/'))) {
            return 'vendor-react';
          }

          // R3F depends on React — keep in same chunk to avoid load-order issues
          if (id.includes('@react-three/fiber') || id.includes('@react-three/postprocessing')) {
            return 'vendor-r3f';
          }

          if (id.includes('@react-three/drei')) {
            return 'vendor-drei';
          }

          if (id.includes('/three/')) {
            return 'vendor-three-core';
          }

          if (id.includes('/firebase/')) {
            return 'vendor-firebase';
          }

          if (id.includes('/framer-motion/')) {
            return 'vendor-motion';
          }

          if (id.includes('/react-markdown/') || id.includes('/remark-gfm/')) {
            return 'vendor-markdown';
          }

          if (id.includes('/react-router-dom/') || id.includes('/react-router/')) {
            return 'vendor-router';
          }

          if (id.includes('/gpt-tokenizer/')) {
            return 'vendor-gpt-tokenizer';
          }

          if (id.includes('/lucide-react/')) {
            return 'vendor-icons';
          }

          if (id.includes('/@radix-ui/')) {
            return 'vendor-radix';
          }

          return 'vendor';
        },
      },
    },
  },
})
