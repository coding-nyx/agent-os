import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import path from 'path'
import fs from 'fs'

/**
 * Injects VITE_FIREBASE_* env vars into the FCM service worker after build,
 * replacing __FIREBASE_*__ tokens. The service worker cannot use ES modules
 * so it cannot access import.meta.env — this is the standard workaround.
 */
function firebaseSwInject(): Plugin {
  return {
    name: 'firebase-sw-inject',
    closeBundle() {
      const swSrc = path.resolve(__dirname, 'public/firebase-messaging-sw.js')
      const swOut = path.resolve(__dirname, 'out/firebase-messaging-sw.js')
      if (!fs.existsSync(swSrc) || !fs.existsSync(path.resolve(__dirname, 'out'))) return

      const env = loadEnv('production', __dirname, 'VITE_')
      let content = fs.readFileSync(swSrc, 'utf-8')
      content = content
        .replace(/__FIREBASE_API_KEY__/g, env.VITE_FIREBASE_API_KEY ?? '')
        .replace(/__FIREBASE_AUTH_DOMAIN__/g, env.VITE_FIREBASE_AUTH_DOMAIN ?? '')
        .replace(/__FIREBASE_PROJECT_ID__/g, env.VITE_FIREBASE_PROJECT_ID ?? '')
        .replace(/__FIREBASE_STORAGE_BUCKET__/g, env.VITE_FIREBASE_STORAGE_BUCKET ?? '')
        .replace(/__FIREBASE_MESSAGING_SENDER_ID__/g, env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '')
        .replace(/__FIREBASE_APP_ID__/g, env.VITE_FIREBASE_APP_ID ?? '')

      fs.writeFileSync(swOut, content, 'utf-8')
      console.log('[firebase-sw-inject] Service worker written with real config.')
    },
  }
}

export default defineConfig({
  plugins: [react(), basicSsl(), firebaseSwInject()],
  server: {
    https: {},
  },
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
